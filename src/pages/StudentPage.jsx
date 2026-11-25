import { useQuery } from "@tanstack/react-query";
import AccountCard from "@/components/app/AccountCard";
import { LoadError, LoadingScreen } from "@/components/app/StatusScreens";
import AttendanceHistory from "@/components/student/AttendanceHistory";
import HomeLocationCard from "@/components/student/HomeLocationCard";
import ParentLinkCard from "@/components/student/ParentLinkCard";
import QrGatePass from "@/components/student/QrGatePass";
import SosButton from "@/components/student/SosButton";
import StudentStatusPanel from "@/components/student/StudentStatusPanel";
import TripTracker from "@/components/student/TripTracker";
import { api } from "@/lib/api";
import { POLL_MS } from "@/lib/campus";

export default function StudentPage() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["student-dashboard"],
    queryFn: api.studentDashboard,
    refetchInterval: POLL_MS.student,
  });

  if (isPending) return <LoadingScreen label="Opening your gate pass…" />;
  if (error) return <LoadError title="We couldn't load your gate pass" error={error} onRetry={refetch} />;

  return (
    <div className="space-y-4 pb-16">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section id="gate-pass" className="scroll-mt-20">
            <QrGatePass data={data} />
          </section>
          <section id="trip" className="scroll-mt-20">
            <TripTracker data={data} onRefresh={refetch} />
          </section>
          <section id="home-map" className="scroll-mt-20">
            <HomeLocationCard student={data.student} onSaved={refetch} />
          </section>
        </div>
        <aside className="space-y-4">
          <StudentStatusPanel data={data} />
          <section id="parent-link" className="scroll-mt-20">
            <ParentLinkCard student={data.student} onChanged={refetch} />
          </section>
          <SosButton variant="card" />
          <AccountCard />
        </aside>
      </div>

      <section id="activity" className="scroll-mt-20">
        <AttendanceHistory history={data.history} />
      </section>

      <div className="fixed inset-x-3 bottom-16 z-20 lg:hidden">
        <SosButton variant="strip" />
      </div>
    </div>
  );
}
