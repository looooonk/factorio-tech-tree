import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ResearchFormula from "../../components/tech-graph/research-formula";
import { evaluate_research_formula, parse_research_formula } from "./research-formula";
import type { TechNode } from "../tech-tree/types";

test("evaluates exponential and linear research at its first level", () => {
    assert.equal(evaluate_research_formula("2^(L-3)*1000", 4), 2000);
    assert.equal(evaluate_research_formula("1000*(L - 2)", 3), 1000);
    assert.equal(evaluate_research_formula("1.5^L*1000", 1), 1500);
    assert.equal(evaluate_research_formula("1.2^L*1000", 1), 1200);
    assert.equal(evaluate_research_formula("2^(L-7)*1000", 7), 1000);
});

test("preserves arithmetic precedence, parentheses, and right-associative powers", () => {
    assert.equal(evaluate_research_formula("2+3*4^2", 1), 50);
    assert.equal(evaluate_research_formula("(2+3)*4^2", 1), 80);
    assert.equal(evaluate_research_formula("2^3^2", 1), 512);
    assert.equal(evaluate_research_formula("100/5/2-3-1", 1), 6);
    assert.equal(evaluate_research_formula("2^(L-(3+1))*1000", 5), 2000);
});

test("rejects unsupported syntax, incomplete formulas, and invalid costs or levels", () => {
    for (const formula of ["", "L L", "2**L", "2^(L-3", "2^L)", "L+", "Math.pow(2,L)", "1..5", "L=4"]) {
        assert.equal(parse_research_formula(formula), null, formula);
    }
    for (const formula of ["1/0", "2^10000", "L-10"]) {
        assert.equal(evaluate_research_formula(formula, 4), null, formula);
    }
    for (const level of [0, -1, 1.5, NaN, Infinity]) {
        assert.equal(evaluate_research_formula("2^L", level), null);
    }
});

test("resolves every infinite formula in the shipped technology data", () => {
    const nodes: TechNode[] = fs.readFileSync(new URL("../../../data/tech_tree.jsonl", import.meta.url), "utf8")
        .trim().split("\n").map((line) => JSON.parse(line));
    const infinite_nodes = nodes.filter((node) => node.is_infinite);
    assert.ok(infinite_nodes.length > 0);
    for (const node of infinite_nodes) {
        const count = evaluate_research_formula(node.research_science!.count_formula!, node.research_level);
        assert.ok(count !== null && count > 0, node.id);
    }
});

test("renders constants first, parenthesizes compound exponents, and uses centered multiplication dots", () => {
    const render = (formula: string) => renderToStaticMarkup(createElement(ResearchFormula, { formula }));
    assert.equal(render("2^(L-3)*1000"), '<span class="research-formula">1000 · 2<sup>(L - 3)</sup></span>');
    assert.equal(render("1000*2^(L-3)"), '<span class="research-formula">1000 · 2<sup>(L - 3)</sup></span>');
    assert.equal(render("1.5^L*1000"), '<span class="research-formula">1000 · 1.5<sup>L</sup></span>');
    assert.equal(render("1000*(L - 2)"), '<span class="research-formula">1000 · (L - 2)</span>');
    assert.equal(render("(L+1)^(L-(3+1))"), '<span class="research-formula">(L + 1)<sup>(L - (3 + 1))</sup></span>');
    assert.equal(render("unknown(L)"), '<span class="research-formula">unknown(L)</span>');
});
