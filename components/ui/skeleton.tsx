import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("shimmer rounded-[10px]", className)} aria-hidden {...props} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-[18px] bg-white p-5 ring-1 ring-[var(--hairline)] shadow-sm">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-4 w-2/3" />
      <Skeleton className="mt-2.5 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-5/6" />
      <Skeleton className="mt-4 h-3 w-28" />
    </div>
  );
}
