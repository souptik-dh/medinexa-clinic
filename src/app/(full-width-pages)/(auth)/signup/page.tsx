import SignUpForm from "@/components/auth/SignUpForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jido Healthcare SignUp Page ",
  description: "This is Next.js SignUp Page  Dashboard Template",
  // other metadata
};

export default function SignUp() {
  return <SignUpForm />;
}
