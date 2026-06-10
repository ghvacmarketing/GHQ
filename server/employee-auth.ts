import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { getCrmUserByEmail } from "./crm-auth";
import { PortalUser } from "@shared/schema";

const scryptAsync = promisify(scrypt);

declare global {
  namespace Express {
    interface User extends PortalUser {}
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashedPassword, salt] = stored.split(".");
  if (!hashedPassword || !salt) return false;
  const hashedPasswordBuf = Buffer.from(hashedPassword, "hex");
  const suppliedPasswordBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedPasswordBuf, suppliedPasswordBuf);
}

export function requirePortalAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    return next();
  }
  return res.status(401).json({ message: "Unauthorized - Portal authentication required" });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    return res.status(401).json({ message: "Unauthorized - Portal authentication required" });
  }
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden - Admin role required" });
  }
  return next();
}

export function requireEmployee(userId: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: "Unauthorized - Portal authentication required" });
    }
    if (req.user.role === "admin") {
      return next();
    }
    if (req.user.id !== userId) {
      return res.status(403).json({ message: "Forbidden - You can only access your own data" });
    }
    return next();
  };
}

export function setupEmployeeAuth(app: Express) {
  passport.use(
    "employee-local",
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getPortalUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Invalid username or password" });
        }
        if (!user.isActive) {
          return done(null, false, { message: "Account is disabled" });
        }
        const isValid = await comparePasswords(password, user.password);
        if (!isValid) {
          return done(null, false, { message: "Invalid username or password" });
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    })
  );

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getPortalUser(id);
      if (!user) {
        return done(null, false);
      }
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/employee-portal/login", (req, res, next) => {
    passport.authenticate("employee-local", (err: any, user: PortalUser | false, info: any) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.logIn(user, async (loginErr) => {
        if (loginErr) {
          return next(loginErr);
        }
        if (req.session) {
          req.session.cookie.maxAge = 28800000;
        }
        await storage.updatePortalUserLastLogin(user.id);
        const { password, ...userWithoutPassword } = user;
        return res.json({ 
          message: "Login successful", 
          user: userWithoutPassword 
        });
      });
    })(req, res, next);
  });

  app.post("/api/employee-portal/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      req.session?.destroy((destroyErr) => {
        if (destroyErr) {
          return res.status(500).json({ message: "Session destruction failed" });
        }
        res.clearCookie("connect.sid");
        return res.json({ message: "Logged out successfully" });
      });
    });
  });

  app.get("/api/employee-portal/me", requirePortalAuth, (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const { password, ...userWithoutPassword } = req.user;
    return res.json(userWithoutPassword);
  });

  app.post("/api/employee-portal/change-password", requirePortalAuth, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }
      const user = await storage.getPortalUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const isValid = await comparePasswords(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Current password is incorrect" });
      }
      const hashedNewPassword = await hashPassword(newPassword);
      await storage.updatePortalUser(user.id, { password: hashedNewPassword });
      return res.json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Error changing password:", error);
      return res.status(500).json({ message: "Failed to change password" });
    }
  });

  // ============================================
  // EMPLOYEE PORTAL TIME TRACKING
  // Records are stored in the shared CRM time-entry system so they also
  // show up for admins in the CRM. The portal account is linked to a CRM
  // staff record by matching email address.
  // ============================================

  // Resolve the CRM staff record that owns this portal user's time entries.
  async function resolveCrmUser(req: Request) {
    const email = req.user?.email;
    if (!email) return null;
    const crmUser = await getCrmUserByEmail(email);
    if (!crmUser || !crmUser.isActive) return null;
    return crmUser;
  }

  // GET current active time entry (plus whether the account is linked)
  app.get("/api/employee-portal/time/current", requirePortalAuth, async (req, res) => {
    try {
      const crmUser = await resolveCrmUser(req);
      if (!crmUser) {
        return res.json({ entry: null, linked: false });
      }
      const entry = await storage.getActiveTimeEntry(crmUser.id);
      return res.json({ entry, linked: true });
    } catch (error) {
      console.error("Error fetching portal time entry:", error);
      return res.status(500).json({ message: "Failed to fetch time entry" });
    }
  });

  // POST clock in
  app.post("/api/employee-portal/time/clock-in", requirePortalAuth, async (req, res) => {
    try {
      const crmUser = await resolveCrmUser(req);
      if (!crmUser) {
        return res.status(409).json({
          message: "Your portal account isn't linked to a staff record yet. Ask an admin to match your email in the CRM.",
        });
      }
      const existing = await storage.getActiveTimeEntry(crmUser.id);
      if (existing) {
        return res.status(400).json({ message: "Already clocked in" });
      }
      const entry = await storage.clockIn(crmUser.id, undefined, "portal");
      return res.status(201).json(entry);
    } catch (error) {
      console.error("Error clocking in (portal):", error);
      return res.status(500).json({ message: "Failed to clock in" });
    }
  });

  // POST clock out
  app.post("/api/employee-portal/time/clock-out", requirePortalAuth, async (req, res) => {
    try {
      const crmUser = await resolveCrmUser(req);
      if (!crmUser) {
        return res.status(409).json({ message: "Your portal account isn't linked to a staff record yet." });
      }
      const active = await storage.getActiveTimeEntry(crmUser.id);
      if (!active) {
        return res.status(400).json({ message: "Not currently clocked in" });
      }
      const entry = await storage.clockOut(active.id);
      return res.json(entry);
    } catch (error) {
      console.error("Error clocking out (portal):", error);
      return res.status(500).json({ message: "Failed to clock out" });
    }
  });

  // GET recent shifts (last 30 days)
  app.get("/api/employee-portal/time/history", requirePortalAuth, async (req, res) => {
    try {
      const crmUser = await resolveCrmUser(req);
      if (!crmUser) {
        return res.json([]);
      }
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const entries = await storage.getTimeEntries({ technicianId: crmUser.id, startDate: thirtyDaysAgo });
      return res.json(entries);
    } catch (error) {
      console.error("Error fetching portal time history:", error);
      return res.status(500).json({ message: "Failed to fetch time history" });
    }
  });
}
