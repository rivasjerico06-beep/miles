import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import ScanResultCard from "@/components/gate/ScanResultCard";
import { api } from "@/lib/api";
import { playErrorTone, playSuccessChime } from "@/lib/scanChime";

const SAME_CODE_PAUSE_MS = 4000;

// Backup scanner on a teacher's phone camera. Uses the same server rules as the ESP32-CAM.
export default function GateScanner({ onScanned }) {
  const [status, setStatus] = useState({ kind: "idle" });
  const [cameraError, setCameraError] = useState("");
  const busyRef = useRef(false);
  const lastRef = useRef({ text: "", at: 0 });
  const lockedRef = useRef(false);
  const scannerRef = useRef(null);
  const onScannedRef = useRef(onScanned);
  useEffect(() => {
    onScannedRef.current = onScanned;
  }, [onScanned]);

  useEffect(() => {
    let cancelled = false;

    async function handleScan(raw) {
      const text = String(raw || "").trim();
      if (!text || busyRef.current) return;
      if (lockedRef.current && text === lastRef.current.text) return;
      if (text === lastRef.current.text && Date.now() - lastRef.current.at < SAME_CODE_PAUSE_MS) return;
      busyRef.current = true;
      lastRef.current = { text, at: Date.now() };
      setStatus({ kind: "checking" });
      try {
        const result = await api.teacherScan(text);
        if (result.ok) playSuccessChime();
        else playErrorTone();
        lockedRef.current = true;
        setStatus({ kind: result.ok ? "ok" : "error", result });
        onScannedRef.current?.();
      } catch (error) {
        playErrorTone();
        setStatus({ kind: "error", result: { message: error.message } });
      } finally {
        busyRef.current = false;
      }
    }

    async function startCamera() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const scanner = new Html5Qrcode("gate-scanner-view", { verbose: false });
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (width, height) => {
              const size = Math.floor(Math.min(width, height) * 0.72);
              return { width: size, height: size };
            },
          },
          handleScan,
          () => {},
        );
      } catch (error) {
        if (cancelled) return;
        setCameraError(
          error?.name === "NotAllowedError"
            ? "Camera access is blocked. Allow the camera for this site in your browser settings, then reload."
            : "The camera could not start. Open this page on a phone and allow camera access.",
        );
      }
    }

    startCamera();
    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      try {
        const state = scanner?.getState?.();
        if (state === 2 || state === 3) scanner.stop().then(() => scanner.clear()).catch(() => {});
      } catch {
        /* already stopped */
      }
    };
  }, []);

  function scanNext() {
    lockedRef.current = false;
    setStatus({ kind: "idle" });
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-2 shadow-sm">
        <div id="gate-scanner-view" className="w-full overflow-hidden rounded-2xl [&_video]:w-full [&_video]:rounded-2xl [&_video]:object-cover" />
        {cameraError && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <CameraOff className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{cameraError}</p>
          </div>
        )}
      </div>
      <ScanResultCard status={status} />
      <Button type="button" variant="outline" className="h-12 w-full gap-2" onClick={scanNext}>
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Scan next pass
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Camera className="h-3.5 w-3.5" aria-hidden="true" />
        Rear camera · scans are logged as “teacher phone”
      </p>
    </div>
  );
}
