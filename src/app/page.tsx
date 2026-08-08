import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/auth-service";

export default async function RootPage() {
  const current = await getCurrentUser();
  redirect(current ? "/select-clinic" : "/login");
}
