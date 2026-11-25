import { queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { unsubscribeFromPush } from "@/lib/notify";

export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: () => api.session(),
  staleTime: 60_000,
});

// The signed-in user ({ id, email, fullName, role, gradeSection }) or null.
export function useCurrentUser() {
  const { data } = useQuery(sessionQuery);
  return data?.user ?? null;
}

export async function logOut(queryClient) {
  await unsubscribeFromPush().catch(() => {});
  await api.logout().catch(() => {});
  queryClient.clear();
  window.location.assign("/login");
}
