import "server-only";
import { readDemoConfiguration } from "@/lib/demo-contract";

export function demoConfiguration() {
  return readDemoConfiguration(process.env);
}

export function demoAccessAvailable(): boolean {
  try {
    return demoConfiguration().enabled;
  } catch {
    return false;
  }
}
