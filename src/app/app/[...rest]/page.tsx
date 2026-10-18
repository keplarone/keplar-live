import { notFound } from "next/navigation";

/** Unknown /app URLs are a real 404. Settings lives at /account. */
export default function UnknownAppPath() {
  notFound();
}
