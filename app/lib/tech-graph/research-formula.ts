type FormulaOperator = "+" | "-" | "*" | "/" | "^";

export type ResearchFormula =
    | number
    | "L"
    | { type: "group"; expression: ResearchFormula }
    | { type: "binary"; operator: FormulaOperator; left: ResearchFormula; right: ResearchFormula };

const operator_groups: FormulaOperator[][] = [["+", "-"], ["*", "/"], ["^"]];

export function parse_research_formula(formula: string): ResearchFormula | null {
    const tokens = formula.match(/\d+(?:\.\d+)?|\S/g) ?? [];
    let position = 0;

    function parse_primary(): ResearchFormula | null {
        const token = tokens[position++];
        if (token === "L") return "L";
        if (token === "(") {
            const expression = parse_expression(0);
            if (expression === null || tokens[position++] !== ")") return null;
            return { type: "group", expression };
        }
        return token !== undefined && /^\d+(?:\.\d+)?$/.test(token) ? Number(token) : null;
    }

    function parse_expression(priority: number): ResearchFormula | null {
        if (priority === operator_groups.length) return parse_primary();
        let left = parse_expression(priority + 1);
        if (left === null) return null;
        while (operator_groups[priority].includes(tokens[position] as FormulaOperator)) {
            const operator = tokens[position++] as FormulaOperator;
            // Powers associate right to left; the other operators associate left to right.
            const right = parse_expression(operator === "^" ? priority : priority + 1);
            if (right === null) return null;
            left = { type: "binary", operator, left, right };
        }
        return left;
    }

    const expression = parse_expression(0);
    return position === tokens.length ? expression : null;
}

function evaluate_expression(expression: ResearchFormula, research_level: number): number {
    if (typeof expression === "number") return expression;
    if (expression === "L") return research_level;
    if (expression.type === "group") return evaluate_expression(expression.expression, research_level);
    const left = evaluate_expression(expression.left, research_level);
    const right = evaluate_expression(expression.right, research_level);
    switch (expression.operator) {
        case "+": return left + right;
        case "-": return left - right;
        case "*": return left * right;
        case "/": return left / right;
        case "^": return left ** right;
    }
}

export function evaluate_research_formula(formula: string, research_level: number): number | null {
    if (!Number.isInteger(research_level) || research_level < 1) return null;
    const expression = parse_research_formula(formula);
    if (expression === null) return null;
    const value = evaluate_expression(expression, research_level);
    return Number.isFinite(value) && value >= 0 ? value : null;
}
