import type { Metadata } from "next";
import { FloorView } from "./floor-view";

export const metadata: Metadata = { title: "Live floor" };

export default function AdminHome() {
  return <FloorView />;
}
