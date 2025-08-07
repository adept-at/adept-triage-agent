"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepairValidator = void 0;
class RepairValidator {
    validateChanges(changes, testFileContent) {
        const errors = [];
        const warnings = [];
        if (!changes || changes.length === 0) {
            errors.push('No changes proposed');
            return { valid: false, errors, warnings };
        }
        const lines = testFileContent.split('\n');
        for (const change of changes) {
            if (change.line < 1 || change.line > lines.length) {
                errors.push(`Invalid line number ${change.line} (file has ${lines.length} lines)`);
                continue;
            }
            const actualLine = lines[change.line - 1];
            if (!this.fuzzyMatch(actualLine, change.oldCode)) {
                errors.push(`Line ${change.line} does not match expected content.\n` +
                    `Expected: "${change.oldCode}"\n` +
                    `Actual: "${actualLine}"`);
            }
            if (!change.newCode || change.newCode.trim() === '') {
                warnings.push(`Line ${change.line}: Replacing with empty content`);
            }
            const dangerousPatterns = [
                { pattern: /cy\.wait\(\d{4,}\)/, message: 'Avoid long waits (>3000ms)' },
                { pattern: /force:\s*true/, message: 'Using force:true may hide real issues' },
                { pattern: /\.\.\./g, message: 'Spread operator might cause issues' },
                { pattern: /eval\(/, message: 'eval() is dangerous and should be avoided' },
            ];
            for (const { pattern, message } of dangerousPatterns) {
                if (pattern.test(change.newCode)) {
                    warnings.push(`Line ${change.line}: ${message}`);
                }
            }
            this.validateCypressBestPractices(change, warnings);
        }
        const lineNumbers = changes.map(c => c.line);
        const duplicates = lineNumbers.filter((line, index) => lineNumbers.indexOf(line) !== index);
        if (duplicates.length > 0) {
            errors.push(`Multiple changes to the same line(s): ${duplicates.join(', ')}`);
        }
        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
    applyChanges(changes, testFileContent) {
        const lines = testFileContent.split('\n');
        const sortedChanges = [...changes].sort((a, b) => b.line - a.line);
        for (const change of sortedChanges) {
            if (change.line > 0 && change.line <= lines.length) {
                lines[change.line - 1] = change.newCode;
            }
        }
        return lines.join('\n');
    }
    async validateSyntax(repairedContent) {
        const errors = [];
        const checks = [
            {
                name: 'Balanced braces',
                test: () => this.checkBalancedBraces(repairedContent)
            },
            {
                name: 'Balanced quotes',
                test: () => this.checkBalancedQuotes(repairedContent)
            },
            {
                name: 'Valid Cypress commands',
                test: () => this.checkCypressCommands(repairedContent)
            },
            {
                name: 'No broken chains',
                test: () => this.checkCypressChains(repairedContent)
            }
        ];
        for (const check of checks) {
            const result = check.test();
            if (!result.valid) {
                errors.push(`${check.name}: ${result.error}`);
            }
        }
        return {
            valid: errors.length === 0,
            errors
        };
    }
    fuzzyMatch(actual, expected) {
        const normalizeWhitespace = (str) => str.replace(/\s+/g, ' ').trim();
        return normalizeWhitespace(actual).includes(normalizeWhitespace(expected));
    }
    validateCypressBestPractices(change, warnings) {
        const newCode = change.newCode;
        if (/cy\.get\(['"]body['"]\)/.test(newCode)) {
            warnings.push(`Line ${change.line}: Avoid selecting 'body', be more specific`);
        }
        if (/cy\.wait\(['"]@/.test(newCode) === false && /cy\.wait\(/.test(newCode)) {
            warnings.push(`Line ${change.line}: Prefer cy.wait('@alias') over arbitrary waits`);
        }
        if (/\.should\(['"]exist['"]\)\.should\(/.test(newCode)) {
            warnings.push(`Line ${change.line}: Chaining multiple assertions can be combined`);
        }
        if (change.oldCode.includes('class=') && !newCode.includes('data-test')) {
            warnings.push(`Line ${change.line}: Consider using data-testid instead of class selectors`);
        }
    }
    checkBalancedBraces(content) {
        const stack = [];
        const pairs = { '{': '}', '[': ']', '(': ')' };
        const closing = new Set(Object.values(pairs));
        const cleanContent = this.removeStringsAndComments(content);
        for (const char of cleanContent) {
            if (pairs[char]) {
                stack.push(char);
            }
            else if (closing.has(char)) {
                const last = stack.pop();
                if (!last || pairs[last] !== char) {
                    return { valid: false, error: `Unmatched ${char}` };
                }
            }
        }
        if (stack.length > 0) {
            return { valid: false, error: `Unclosed ${stack[stack.length - 1]}` };
        }
        return { valid: true };
    }
    checkBalancedQuotes(content) {
        const cleanContent = content.replace(/\\["'`]/g, '');
        const quotes = ['"', "'", '`'];
        for (const quote of quotes) {
            const count = (cleanContent.match(new RegExp(quote, 'g')) || []).length;
            if (count % 2 !== 0) {
                return { valid: false, error: `Unbalanced ${quote} quotes` };
            }
        }
        return { valid: true };
    }
    checkCypressCommands(content) {
        const validCommands = [
            'get', 'find', 'contains', 'click', 'type', 'should', 'wait',
            'visit', 'request', 'intercept', 'fixture', 'task', 'exec',
            'readFile', 'writeFile', 'within', 'parent', 'children',
            'first', 'last', 'eq', 'filter', 'not', 'each', 'then'
        ];
        const commandPattern = /cy\.([a-zA-Z]+)\(/g;
        let match;
        while ((match = commandPattern.exec(content)) !== null) {
            const command = match[1];
            if (!validCommands.includes(command)) {
                if (!content.includes(`Cypress.Commands.add('${command}'`)) {
                    return {
                        valid: false,
                        error: `Unknown Cypress command: cy.${command}()`
                    };
                }
            }
        }
        return { valid: true };
    }
    checkCypressChains(content) {
        const brokenChainPattern = /cy\.[a-zA-Z]+\([^)]*\)\.\s*$/gm;
        if (brokenChainPattern.test(content)) {
            return { valid: false, error: 'Incomplete Cypress command chain detected' };
        }
        if (/\.\.\s*[a-zA-Z]/.test(content)) {
            return { valid: false, error: 'Double dots in chain detected' };
        }
        return { valid: true };
    }
    removeStringsAndComments(content) {
        content = content.replace(/\/\/.*$/gm, '');
        content = content.replace(/\/\*[\s\S]*?\*\//g, '');
        content = content.replace(/"[^"]*"/g, '""');
        content = content.replace(/'[^']*'/g, "''");
        content = content.replace(/`[^`]*`/g, '``');
        return content;
    }
}
exports.RepairValidator = RepairValidator;
//# sourceMappingURL=validator.js.map