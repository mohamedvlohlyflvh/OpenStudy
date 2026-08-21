import { cn } from "@/lib/utils";
import { forwardRef, type ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-bold uppercase tracking-tighter transition-all duration-200",
          "disabled:pointer-events-none disabled:opacity-50",
          "active:scale-95",
          "relative overflow-hidden",
          "before:absolute before:inset-0 before:-translate-x-full before:bg-white/10 before:transition-transform before:duration-300 hover:before:translate-x-0",
          {
            "bg-accent text-accent-fg hover:scale-[1.04] hover:bg-accent":
              variant === "primary",
            "border-2 border-border bg-bg text-fg hover:bg-fg hover:text-bg":
              variant === "secondary",
            "text-muted-fg hover:text-accent":
              variant === "ghost",
            "border-2 border-danger bg-danger/10 text-danger hover:bg-danger hover:text-on-color":
              variant === "danger",
          },
          {
            "h-10 px-4 text-xs": size === "sm",
            "h-12 px-6 text-sm": size === "md",
            "h-14 px-8 text-base": size === "lg",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

// ─── Card ─────────────────────────────────────────────────────────
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ className, hover, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "border-2 border-border bg-bg p-6 transition-all duration-200",
        // On hover the card fills with the accent color — force descendant
        // text to accent-fg so nothing becomes unreadable. EXCLUDE elements
        // that carry their own bg-* class (e.g. tag chips with bg-muted):
        // they keep their own surface + text color, otherwise they'd render
        // dark-on-dark and vanish.
        hover && "cursor-pointer hover:border-accent hover:bg-accent hover:text-accent-fg hover:[&_*:not([class*='bg-'])]:text-accent-fg group",
        className
      )}
      {...props}
    />
  );
}

// ─── Badge ────────────────────────────────────────────────────────
interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest",
        {
          "bg-muted text-muted-fg": variant === "default",
          "bg-success/10 text-success": variant === "success",
          "bg-warning/10 text-warning": variant === "warning",
          "bg-danger/10 text-danger": variant === "danger",
        },
        className
      )}
    >
      {children}
    </span>
  );
}

// ─── Input ────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            "flex h-12 w-full border-b-2 border-border bg-transparent px-0 py-2 text-lg font-bold uppercase tracking-tight",
            "text-fg placeholder:text-muted-fg/70",
            "focus:border-accent focus:outline-none",
            "transition-colors duration-200",
            error && "border-danger",
            className
          )}
          {...props}
        />
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

// ─── Textarea ─────────────────────────────────────────────────────
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ className, label, error, ...props }: TextareaProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="text-xs font-bold uppercase tracking-widest text-muted-fg">
          {label}
        </label>
      )}
      <textarea
        className={cn(
          "flex w-full border-b-2 border-border bg-transparent px-0 py-2 text-lg font-bold tracking-tight",
          "text-fg placeholder:text-muted-fg/70",
          "focus:border-accent focus:outline-none resize-none",
          "transition-colors duration-200",
          error && "border-danger",
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-[rise_0.2s_ease-out]"
        onClick={onClose}
      />
      <div className="rise-in relative w-full max-w-md border-2 border-border bg-bg p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-bold uppercase tracking-tighter">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-none p-1 text-muted-fg transition-colors hover:bg-accent hover:text-accent-fg"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────
interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-6 text-muted-fg transition-colors group-hover:text-accent">
        {icon}
      </div>
      <h3 className="mb-2 text-3xl font-bold uppercase tracking-tighter">{title}</h3>
      <p className="mb-8 max-w-sm text-sm text-muted-fg">{description}</p>
      {action}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-none", className)} />;
}

// ─── Massive Number ───────────────────────────────────────────────
interface MassiveNumberProps {
  value: string | number;
  label: string;
  className?: string;
}

export function MassiveNumber({ value, label, className }: MassiveNumberProps) {
  return (
    <div className={cn("text-center", className)}>
      <p className="text-6xl font-bold uppercase tracking-tighter text-muted lg:text-8xl">
        {value}
      </p>
      <p className="mt-2 text-xs font-bold uppercase tracking-widest text-muted-fg">
        {label}
      </p>
    </div>
  );
}
