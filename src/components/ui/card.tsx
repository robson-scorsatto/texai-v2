import { type HTMLAttributes } from "react";
import { clsx } from "@/lib/clsx";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx("rounded-xl border border-gray-200 bg-white p-6 shadow-sm", className)}
      {...props}
    />
  );
}
