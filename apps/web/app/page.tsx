import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { landingPathForRoles } from "@/lib/roles";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(landingPathForRoles(user.roles));
}
