#!/usr/bin/env node
/**
 * scripts/test/source-calibration.test.mjs — a layout, or a calibration of one
 * reference at one size.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { classifyJavaFile, scanCalibration } from "../lib/source-calibration.mjs";

const CALIBRATED = `
package com.example.invoice;

public final class GeneratedInvoiceTemplate {
    private static final float PAGE_W = 595f;
    private static final float REFERENCE_PX_WIDTH = 1055.0f;
    private static final float PX = PAGE_W / REFERENCE_PX_WIDTH;
    private static final float MARGIN_L = px(51);
    private static final float CAP_RATIO_BOLD = 0.723f;
    private static final float TEXT_TOP_BEARING = 0.235f;
    private static final float TITLE_SIZE = sizeB(46.53f);
    private static final float BODY_SIZE = sizeR(11.08f);

    private DocumentNode renderItemRow(Item item) {
        RowBuilder row = new RowBuilder();
        row.margin(new DocumentInsets(px(668 - 648) - TEXT_TOP_BEARING * TITLE_SIZE, 0, 0, 0));
        row.padding(8.65f);
        row.spacing(px(12));
        return row.build();
    }

    private static float px(float referencePixels) {
        return referencePixels * PX;
    }
}
`;

const DERIVED = `
package com.example.cv;

public final class GeneratedCvTemplate {
    private static final float SIDEBAR_WEIGHT = 0.31f;
    private static final float MAIN_WEIGHT = 1f - SIDEBAR_WEIGHT;
    private static final float GUTTER = 12f;

    private DocumentNode renderSidebar(CvSpec spec) {
        SectionBuilder s = new SectionBuilder();
        s.padding(0, 0, 0, GUTTER).spacing(6);
        return s.build();
    }
}
`;

test("a calibrated template is named for each of the four shapes, and the gate refuses it", () => {
  const scan = scanCalibration(CALIBRATED, { role: "template" });
  assert.ok(scan.counts["reference-pixel-scale"] >= 2, JSON.stringify(scan.counts));
  assert.equal(scan.counts["font-metric-constant"], 2);
  assert.ok(scan.counts["reference-pixel-arithmetic"] >= 2, "px(668 - 648) and px(12) in a method");
  assert.ok(scan.counts["calibrated-literal"] >= 3, "sizeB(46.53), sizeR(11.08), padding(8.65)");
  assert.equal(scan.verdict, "calibrated");
  assert.deepEqual(
    scan.blocking.map((b) => b.id).sort(),
    ["font-metric-constant", "reference-pixel-arithmetic"],
  );
  const arithmetic = scan.findings.find((f) => f.kind === "reference-pixel-arithmetic");
  assert.equal(arithmetic.method, "renderItemRow");
  assert.match(arithmetic.name, /px\(668 - 648\)/);
});

test("a derived template has nothing to report", () => {
  const scan = scanCalibration(DERIVED, { role: "template" });
  assert.deepEqual(scan.findings, []);
  assert.equal(scan.verdict, "derived");
});

test("a theme may carry calibrated tokens without meeting the gate", () => {
  const theme = `
public final class NorthlineTheme {
    public static final float TITLE_SIZE = 46.53f;
    public static final float CAP_RATIO = 0.72f;
    public static DocumentInsets pagePadding() { return new DocumentInsets(28.35f, 0, 0, 0); }
}
`;
  const scan = scanCalibration(theme, { role: "theme" });
  assert.ok(scan.findings.length > 0, "the tokens are still reported as findings");
  assert.deepEqual(scan.blocking, []);
  assert.equal(scan.verdict, "leaning");
});

test("files are classified by name and by the class they declare", () => {
  assert.equal(classifyJavaFile("GeneratedCvTemplate.java", ""), "template");
  assert.equal(classifyJavaFile("generated-template.java", ""), "template");
  assert.equal(classifyJavaFile("StripeInvoiceTemplate.java", ""), "template");
  assert.equal(classifyJavaFile("NorthlineTheme.java", ""), "theme");
  assert.equal(classifyJavaFile("Anything.java", "public final class MintTheme {}"), "theme");
  assert.equal(classifyJavaFile("CvSpec.java", ""), "other");
  assert.equal(classifyJavaFile("CvSpecProvider.java", ""), "other");
  assert.equal(classifyJavaFile("GeneratedCvTemplateTest.java", ""), "other");
});
