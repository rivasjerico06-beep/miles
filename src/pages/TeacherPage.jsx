import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import AccountCard from "@/components/app/AccountCard";
import { LoadError, LoadingScreen } from "@/components/app/StatusScreens";
import GateScanner from "@/components/gate/GateScanner";
import ClassTable from "@/components/teacher/ClassTable";
import ResearchCard from "@/components/teacher/ResearchCard";
import SettingsCard from "@/components/teacher/SettingsCard";
import TeacherSummary from "@/components/teacher/TeacherSummary";
import { api } from "@/lib/api";
import { POLL_MS } from "@/lib/campus";

export default function TeacherPage() {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState("advisory");
  const [scannerOpen, setScannerOpen] = useState(false);
  const { data, isPending, error, refetch, isFetching } = useQuery({
    queryKey: ["teacher-dashboard", scope],
    queryFn: () => api.teacherDashboard(scope),
    refetchInterval: POLL_MS.teacher,
  });

  if (isPending) return <LoadingScreen label="Loading class status…" />;
  if (error) return <LoadError title="We couldn't load the class status" error={error} onRetry={refetch} />;

  const refreshAll = () => queryClient.invalidateQueries({ queryKey: ["teacher-dashboard"] });

  return (
    <div className="space-y-4 pb-8">
      <section id="summary" className="scroll-mt-20">
        <TeacherSummary
          counts={data.counts}
          clock={data.clock}
          advisory={data.advisory}
          scope={data.scope}
          lateAfterLabel={data.settings.lateAfterLabel}
          onScopeChange={setScope}
          onRefresh={refetch}
          refreshing={isFetching}
        />
      </section>

      <section id="class-status" className="scroll-mt-20">
        <ClassTable rows={data.rows} clock={data.clock} advisory={data.advisory} scope={data.scope} />
      </section>

      <section id="gate-scanner" className="scroll-mt-20 space-y-3">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight">Backup scanner</h2>
          <p className="text-sm text-muted-foreground">
            The ESP32-CAM at the classroom door is the main scanner. If it is unavailable, scan passes with this phone's camera.
          </p>
        </div>
        {scannerOpen ? (
          <GateScanner onScanned={refreshAll} />
        ) : (
          <Button type="button" variant="outline" onClick={() => setScannerOpen(true)}>
            <Camera className="mr-2 h-4 w-4" aria-hidden="true" />
            Open the backup scanner
          </Button>
        )}
      </section>

      <section id="research" className="scroll-mt-20">
        <ResearchCard />
      </section>

      <section id="settings" className="scroll-mt-20 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SettingsCard settings={data.settings} onSaved={refreshAll} />
        </div>
        <AccountCard />
      </section>
    </div>
  );
}
