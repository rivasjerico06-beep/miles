import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { createAppRouter } from "@/router";

let router;

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // A dashboard poll that comes back 401 means the session ended: go back to the login page.
    onError: (error, query) => {
      if (error?.status === 401 && query.queryKey[0] !== "session") {
        queryClient.setQueryData(["session"], { user: null });
        router?.navigate({ to: "/login", replace: true });
      }
    },
  }),
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true },
  },
});

router = createAppRouter(queryClient);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="top-center" closeButton />
    </QueryClientProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
