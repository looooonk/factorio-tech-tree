import type { ReactNode } from "react";
import { parse_research_formula, type ResearchFormula as FormulaExpression } from "../../lib/tech-graph/research-formula";

function render_expression(expression: FormulaExpression): ReactNode {
    if (typeof expression === "number" || expression === "L") return expression;
    if (expression.type === "group") return <>({render_expression(expression.expression)})</>;
    if (expression.operator === "^") {
        const exponent = typeof expression.right === "object" && expression.right.type === "group"
            ? expression.right.expression : expression.right;
        return <>{render_expression(expression.left)}<sup>{exponent === "L" ? exponent : <>({render_expression(exponent)})</>}</sup></>;
    }
    if (expression.operator === "*" && typeof expression.right === "number" && typeof expression.left !== "number") {
        return <>{expression.right} · {render_expression(expression.left)}</>;
    }
    return <>{render_expression(expression.left)} {expression.operator === "*" ? "·" : expression.operator} {render_expression(expression.right)}</>;
}

export default function ResearchFormula({ formula }: { formula: string }) {
    const expression = parse_research_formula(formula);
    return <span className="research-formula">{expression === null ? formula : render_expression(expression)}</span>;
}
