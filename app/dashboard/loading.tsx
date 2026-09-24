import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return <div className="space-y-6"><div className="space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-10 w-80" /><Skeleton className="h-4 w-96" /></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-32 rounded-2xl" />)}</div><Skeleton className="h-80 rounded-2xl" /></div>;
}
