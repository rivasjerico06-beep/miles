import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Mail, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS } from "@/lib/campus";
import { logOut, useCurrentUser } from "@/lib/session";

function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function ProfileMenu() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const name = user?.fullName || user?.email || "Account";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-10 gap-2 rounded-full px-1.5 pr-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open profile menu"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {initials(name) || "CP"}
          </span>
          <span className="hidden max-w-28 truncate text-sm font-medium sm:block">{name.split(" ")[0]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-1.5 font-normal">
          <p className="text-sm font-semibold text-foreground">{name}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            <Mail className="h-3 w-3" aria-hidden="true" />
            {user?.email}
          </p>
          {user?.role && <Badge className="mt-1 bg-primary/10 text-primary hover:bg-primary/10">{ROLE_LABELS[user.role]}</Badge>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            Role locked to this account
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => logOut(queryClient)}
          className="cursor-pointer gap-2 font-medium text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
