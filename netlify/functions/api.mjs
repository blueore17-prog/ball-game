// Netlify entry point for the challenges API; data lives in Netlify Blobs.
import { getStore } from "@netlify/blobs";
import { handle } from "../../api/handle.mjs";

export default async (req) => handle(req, getStore({ name: "ball-challenges", consistency: "strong" }));
export const config = { path: "/api/*" };
