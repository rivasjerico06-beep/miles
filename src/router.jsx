import { Outlet, createRootRouteWithContext, createRoute, createRouter, lazyRouteComponent, redirect } from "@tanstack/react-router";
import AppShell from "@/components/app/AppShell";
import { ErrorScreen, NotFound } from "@/components/app/StatusScreens";
import LoginPage from "@/components/auth/LoginPage";
import RegisterPage from "@/components/auth/RegisterPage";
import { roleHome } from "@/lib/campus";
import { sessionQuery } from "@/lib/session";

// Each workspace loads only when it is opened.
const StudentPage = lazyRouteComponent(() => import("@/pages/StudentPage"));
const ParentPage = lazyRouteComponent(() => import("@/pages/ParentPage"));
const TeacherPage = lazyRouteComponent(() => import("@/pages/TeacherPage"));
const CameraPage = lazyRouteComponent(() => import("@/pages/CameraPage"));

const rootRoute = createRootRouteWithContext()({
  component: Outlet,
  notFoundComponent: NotFound,
  errorComponent: ErrorScreen,
});

async function currentUser(context) {
  const { user } = await context.queryClient.ensureQueryData(sessionQuery);
  return user;
}

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async ({ context }) => {
    const user = await currentUser(context);
    throw redirect({ to: user ? roleHome(user.role) : "/login", replace: true });
  },
});

const guestOnly = async ({ context }) => {
  const user = await currentUser(context);
  if (user) throw redirect({ to: roleHome(user.role), replace: true });
};

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", beforeLoad: guestOnly, component: LoginPage });
const registerRoute = createRoute({ getParentRoute: () => rootRoute, path: "/register", beforeLoad: guestOnly, component: RegisterPage });

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async ({ context }) => {
    const user = await currentUser(context);
    if (!user) throw redirect({ to: "/login", replace: true });
    return { user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

function workspace(path, role, component) {
  return createRoute({
    getParentRoute: () => appRoute,
    path,
    beforeLoad: ({ context }) => {
      if (context.user.role !== role) throw redirect({ to: roleHome(context.user.role), replace: true });
    },
    component,
  });
}

const routeTree = rootRoute.addChildren([
  indexRoute,
  loginRoute,
  registerRoute,
  appRoute.addChildren([
    workspace("/student", "student", StudentPage),
    workspace("/parent", "parent", ParentPage),
    workspace("/teacher", "teacher", TeacherPage),
    // Not linked from the menus: open it by its address.
    workspace("/teacher/camera", "teacher", CameraPage),
  ]),
]);

export function createAppRouter(queryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: false,
    scrollRestoration: true,
  });
}
