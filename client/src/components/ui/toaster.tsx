import { useLocation } from "wouter"
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()
  const [location] = useLocation()
  // In the mobile app, lift the stack clear of the bottom tab bar.
  const inMobileApp = location.startsWith("/mobile")

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport
        className={inMobileApp ? "bottom-[calc(64px+env(safe-area-inset-bottom))]" : undefined}
      />
    </ToastProvider>
  )
}
