import { describe, expect, it } from "vitest";
import { evsCredentials, evsPlan, evsPython, vmpCommand } from "../../scripts/evs.mjs";

const account = { EVS_ACCOUNT_NAME: "joychromium", EVS_PASSWD: "segredo" };

describe("EVS (VMP signing)", () => {
  it("needs both halves of the account, and blank counts as missing", () => {
    expect(evsCredentials(account)).toEqual({ account: "joychromium", passwd: "segredo" });
    expect(evsCredentials({ EVS_ACCOUNT_NAME: "joychromium" })).toBeNull();
    expect(evsCredentials({ EVS_ACCOUNT_NAME: "  ", EVS_PASSWD: "segredo" })).toBeNull();
    expect(evsCredentials({})).toBeNull();
  });

  it("signs on the two platforms whose CDM is verified through VMP", () => {
    expect(evsPlan("darwin", account)).toEqual({ sign: true, account: "joychromium" });
    expect(evsPlan("win32", account)).toEqual({ sign: true, account: "joychromium" });
  });

  it("skips Linux, which has no VMP signature, and says so", () => {
    const plan = evsPlan("linux", account);
    expect(plan.sign).toBe(false);
    expect(plan.reason).toContain("Linux");
  });

  it("skips, with the reason that matters, when the account is missing", () => {
    const plan = evsPlan("darwin", {});
    expect(plan.sign).toBe(false);
    expect(plan.reason).toContain("EVS_ACCOUNT_NAME");
  });

  it("spawns the client non-interactively over the packaged directory", () => {
    expect(vmpCommand("darwin", "/build/mac-arm64")).toEqual({
      command: "python3",
      args: ["-m", "castlabs_evs.vmp", "-n", "sign-pkg", "/build/mac-arm64"],
    });
    expect(vmpCommand("win32", "C:\\build\\win-unpacked").command).toBe("python");
    expect(evsPython("linux")).toBe("python3");
  });
});
