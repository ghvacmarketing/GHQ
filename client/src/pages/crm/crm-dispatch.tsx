import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  User,
  Clock,
  MapPin,
} from "lucide-react";
import { CrmLayout } from "@/components/crm/crm-layout";
import type { CrmUser } from "@shared/schema";

type JobStatus = "scheduled" | "in_progress" | "completed" | "cancelled";
type FilterStatus = "all" | "unassigned" | "in_progress" | "completed";

interface Job {
  id: string;
  customerName: string;
  jobType: string;
  startTime: number;
  endTime: number;
  status: JobStatus;
  address?: string;
  technicianId: string;
}

interface Technician {
  id: string;
  name: string;
  initials: string;
  color: string;
}

const placeholderTechnicians: Technician[] = [
  { id: "1", name: "Mike T.", initials: "MT", color: "from-blue-500 to-blue-600" },
  { id: "2", name: "Sarah J.", initials: "SJ", color: "from-purple-500 to-purple-600" },
  { id: "3", name: "Carlos R.", initials: "CR", color: "from-emerald-500 to-emerald-600" },
  { id: "4", name: "Lisa M.", initials: "LM", color: "from-amber-500 to-amber-600" },
];

const placeholderJobs: Job[] = [
  {
    id: "1",
    customerName: "Johnson Family",
    jobType: "AC Repair",
    startTime: 8,
    endTime: 10,
    status: "completed",
    address: "123 Oak St",
    technicianId: "1",
  },
  {
    id: "2",
    customerName: "Smith Residence",
    jobType: "Furnace Install",
    startTime: 10,
    endTime: 14,
    status: "in_progress",
    address: "456 Maple Ave",
    technicianId: "1",
  },
  {
    id: "3",
    customerName: "Williams Corp",
    jobType: "HVAC Maintenance",
    startTime: 9,
    endTime: 11,
    status: "scheduled",
    address: "789 Business Blvd",
    technicianId: "2",
  },
  {
    id: "4",
    customerName: "Garcia Home",
    jobType: "Duct Cleaning",
    startTime: 13,
    endTime: 15,
    status: "scheduled",
    address: "321 Pine Rd",
    technicianId: "2",
  },
  {
    id: "5",
    customerName: "Thompson Estate",
    jobType: "Heat Pump Service",
    startTime: 7,
    endTime: 9,
    status: "completed",
    address: "555 Cedar Ln",
    technicianId: "3",
  },
  {
    id: "6",
    customerName: "Anderson Family",
    jobType: "AC Install",
    startTime: 11,
    endTime: 16,
    status: "in_progress",
    address: "999 Elm Dr",
    technicianId: "3",
  },
  {
    id: "7",
    customerName: "Martinez Office",
    jobType: "Thermostat Install",
    startTime: 14,
    endTime: 16,
    status: "cancelled",
    address: "222 Tech Park",
    technicianId: "4",
  },
  {
    id: "8",
    customerName: "Brown Residence",
    jobType: "Emergency Repair",
    startTime: 17,
    endTime: 19,
    status: "scheduled",
    address: "444 Sunset Blvd",
    technicianId: "4",
  },
];

const hours = Array.from({ length: 17 }, (_, i) => i + 6);

const statusColors: Record<JobStatus, { bg: string; border: string; text: string }> = {
  scheduled: { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-800" },
  in_progress: { bg: "bg-yellow-100", border: "border-yellow-300", text: "text-yellow-800" },
  completed: { bg: "bg-green-100", border: "border-green-300", text: "text-green-800" },
  cancelled: { bg: "bg-red-100", border: "border-red-300", text: "text-red-800" },
};

const statusLabels: Record<JobStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatHour(hour: number): string {
  if (hour === 12) return "12pm";
  if (hour > 12) return `${hour - 12}pm`;
  return `${hour}am`;
}

function JobCard({ job }: { job: Job }) {
  const colors = statusColors[job.status];
  const widthPercent = ((job.endTime - job.startTime) / 16) * 100;
  const leftPercent = ((job.startTime - 6) / 16) * 100;

  return (
    <div
      className={`absolute top-1 bottom-1 rounded-md border ${colors.bg} ${colors.border} ${colors.text} px-2 py-1 overflow-hidden cursor-pointer hover:shadow-md transition-shadow`}
      style={{
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        minWidth: "80px",
      }}
      data-testid={`job-card-${job.id}`}
    >
      <div className="flex flex-col h-full justify-center">
        <p className="text-xs font-semibold truncate">{job.customerName}</p>
        <p className="text-xs truncate opacity-80">{job.jobType}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <Clock className="h-3 w-3" />
          <span className="text-xs">
            {formatHour(job.startTime)} - {formatHour(job.endTime)}
          </span>
        </div>
      </div>
    </div>
  );
}

function MobileJobCard({ job, technician }: { job: Job; technician: Technician }) {
  const colors = statusColors[job.status];

  return (
    <Card className={`${colors.bg} ${colors.border} border`} data-testid={`mobile-job-card-${job.id}`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-sm ${colors.text}`}>{job.customerName}</p>
            <p className={`text-xs ${colors.text} opacity-80`}>{job.jobType}</p>
          </div>
          <Badge variant="outline" className={`${colors.text} ${colors.border} text-xs`}>
            {statusLabels[job.status]}
          </Badge>
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-slate-600">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{formatHour(job.startTime)} - {formatHour(job.endTime)}</span>
          </div>
          <div className="flex items-center gap-1">
            <User className="h-3 w-3" />
            <span>{technician.name}</span>
          </div>
        </div>
        {job.address && (
          <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
            <MapPin className="h-3 w-3" />
            <span>{job.address}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CrmDispatch() {
  const [, navigate] = useLocation();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [filter, setFilter] = useState<FilterStatus>("all");

  const { data: currentUser, isLoading: authLoading } = useQuery<CrmUser | null>({
    queryKey: ["/api/crm/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/crm/login");
    }
  }, [authLoading, currentUser, navigate]);

  const filteredJobs = placeholderJobs.filter((job) => {
    if (filter === "all") return true;
    if (filter === "unassigned") return !job.technicianId;
    if (filter === "in_progress") return job.status === "in_progress";
    if (filter === "completed") return job.status === "completed";
    return true;
  });

  const getJobsForTechnician = (techId: string) => {
    return filteredJobs.filter((job) => job.technicianId === techId);
  };

  const changeDate = (days: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + days);
    setSelectedDate(newDate);
  };

  const goToToday = () => {
    setSelectedDate(new Date());
  };

  const dateDisplay = selectedDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="flex gap-4">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <CrmLayout currentUser={currentUser}>
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900" data-testid="text-dispatch-title">
              Dispatch Board
            </h1>
            <p className="text-slate-500 text-sm flex items-center gap-2 mt-1">
              <CalendarDays className="h-4 w-4" />
              Schedule and manage technician assignments
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 bg-white rounded-lg border shadow-sm p-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => changeDate(-1)}
                data-testid="button-prev-day"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant={isToday ? "default" : "ghost"}
                size="sm"
                className="h-8 px-3"
                onClick={goToToday}
                data-testid="button-today"
              >
                Today
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => changeDate(1)}
                data-testid="button-next-day"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Badge variant="outline" className="text-slate-600 py-1.5 px-3" data-testid="badge-selected-date">
              {dateDisplay}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-2" data-testid="filter-buttons">
          {(["all", "unassigned", "in_progress", "completed"] as FilterStatus[]).map((status) => (
            <Button
              key={status}
              variant={filter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(status)}
              data-testid={`filter-${status}`}
            >
              {status === "all" && "All Jobs"}
              {status === "unassigned" && "Unassigned"}
              {status === "in_progress" && "In Progress"}
              {status === "completed" && "Completed"}
            </Button>
          ))}
        </div>

        <Card className="bg-white border shadow-sm hidden lg:block" data-testid="card-timeline">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-600" />
              Daily Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="w-full">
              <div className="min-w-[1000px]">
                <div className="flex border-b border-slate-200">
                  <div className="w-48 flex-shrink-0 p-3 bg-slate-50 border-r border-slate-200 font-medium text-sm text-slate-600">
                    Technician
                  </div>
                  <div className="flex-1 flex">
                    {hours.map((hour) => (
                      <div
                        key={hour}
                        className="flex-1 text-center py-3 text-xs font-medium text-slate-500 border-r border-slate-100 last:border-r-0"
                        style={{ minWidth: "60px" }}
                      >
                        {formatHour(hour)}
                      </div>
                    ))}
                  </div>
                </div>

                {placeholderTechnicians.map((tech) => (
                  <div
                    key={tech.id}
                    className="flex border-b border-slate-100 last:border-b-0 hover:bg-slate-50/50 transition-colors"
                    data-testid={`technician-row-${tech.id}`}
                  >
                    <div className="w-48 flex-shrink-0 p-3 bg-slate-50/50 border-r border-slate-200">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${tech.color} flex items-center justify-center text-white text-xs font-semibold`}>
                          {tech.initials}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{tech.name}</p>
                          <p className="text-xs text-slate-500">
                            {getJobsForTechnician(tech.id).length} jobs
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 relative h-16">
                      <div className="absolute inset-0 flex">
                        {hours.map((hour) => (
                          <div
                            key={hour}
                            className="flex-1 border-r border-slate-100 last:border-r-0"
                            style={{ minWidth: "60px" }}
                          />
                        ))}
                      </div>
                      {getJobsForTechnician(tech.id).map((job) => (
                        <JobCard key={job.id} job={job} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="lg:hidden space-y-4" data-testid="mobile-job-list">
          <Card className="bg-white border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Clock className="h-5 w-5 text-indigo-600" />
                Today's Jobs
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredJobs.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No jobs match the current filter</p>
              ) : (
                filteredJobs.map((job) => {
                  const tech = placeholderTechnicians.find((t) => t.id === job.technicianId);
                  return tech ? (
                    <MobileJobCard key={job.id} job={job} technician={tech} />
                  ) : null;
                })
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white border shadow-sm" data-testid="card-legend">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm font-medium text-slate-600">Status Legend:</span>
              {(Object.keys(statusColors) as JobStatus[]).map((status) => (
                <div key={status} className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded ${statusColors[status].bg} ${statusColors[status].border} border`} />
                  <span className="text-sm text-slate-600">{statusLabels[status]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </CrmLayout>
  );
}
