import { describe, expect, it } from "vitest";
import { doctorNameSql, formatDoctorName, stripDoctorPrefix } from "../../api/src/lib/doctor-name";

describe("stripDoctorPrefix", () => {
  it.each([
    ["Dr. Riya Sen", "Riya Sen"],
    ["dr riya sen", "riya sen"],
    ["DR.Riya Sen", "Riya Sen"],
    ["Dr. Dr. Riya Sen", "Riya Sen"],
    ["  Dr   Riya  ", "Riya"],
    ["Riya Sen", "Riya Sen"],
  ])("%s → %s", (input, expected) => {
    expect(stripDoctorPrefix(input)).toBe(expected);
  });

  it("leaves names that merely start with the letters Dr alone", () => {
    expect(stripDoctorPrefix("Drake Sen")).toBe("Drake Sen");
    expect(stripDoctorPrefix("Dristi Rao")).toBe("Dristi Rao");
  });
});

describe("formatDoctorName", () => {
  it("adds the default title", () => {
    expect(formatDoctorName("Riya Sen")).toBe("Dr. Riya Sen");
  });

  it("is idempotent for already titled names", () => {
    expect(formatDoctorName("Dr. Riya Sen")).toBe("Dr. Riya Sen");
    expect(formatDoctorName(formatDoctorName("Riya Sen"))).toBe("Dr. Riya Sen");
  });

  it("uses the stored prefix, or none when it is blank", () => {
    expect(formatDoctorName("Riya Sen", "Prof. Dr.")).toBe("Prof. Dr. Riya Sen");
    expect(formatDoctorName("Riya Sen", "")).toBe("Riya Sen");
    expect(formatDoctorName("Riya Sen", null)).toBe("Riya Sen");
  });

  it("returns an empty string for missing names (safe inside message templates)", () => {
    expect(formatDoctorName(null)).toBe("");
    expect(formatDoctorName(undefined)).toBe("");
    expect(formatDoctorName("  Dr.  ")).toBe("");
  });
});

describe("doctorNameSql", () => {
  it("joins the prefix and name, skipping a blank prefix", () => {
    expect(doctorNameSql()).toBe("CONCAT_WS(' ', NULLIF(TRIM(d.name_prefix), ''), d.name)");
    expect(doctorNameSql("doc")).toContain("doc.name_prefix");
  });
});
