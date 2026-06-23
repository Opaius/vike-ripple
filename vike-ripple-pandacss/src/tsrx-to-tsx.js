/**
 * Transform Ripple .tsrx content into valid TSX for Panda CSS extraction.
 *
 * Ripple uses @-prefixed template syntax inside TSX. This transform:
 *   - Strips <style> blocks (CSS is noise for extraction)
 *   - Replaces `@{}` function body markers with `{}`
 *   - Strips `@if/for/else/empty` directive wrappers, keeping brace-delimited bodies
 *     as valid JSX expression blocks so ts-morph can traverse them
 *   - Converts `&[varname]` reactive declarations to plain identifiers
 *
 * The result is parseable TSX — not semantically correct, but ts-morph can walk it
 * to find css()/cva()/sva() calls.
 */

// Match @if/for/else-if directives with their args up to the opening brace.
// Handles one level of nested parentheses in conditions.
const directiveOpenRe =
	/@(?:(if|for|else\s+if)\s*\((?:[^()]|\([^()]*\))*\)|(else|empty))\s*(\{)/g;
// Match @{} function body markers
const atBlockOpenRe = /@\{/g;
// Match <style> blocks (including attributes like scoped)
const styleBlockRe = /<style[^>]*>[\s\S]*?<\/style>/gi;
// Match reactive declarations
const reactiveDeclRe = /(let|const|var)\s+&\[(\w+)\]/g;

export function tsrxToTsx(code) {
	// 1. Strip <style> blocks
	let result = code.replace(styleBlockRe, '');

	// 2. Replace function body @{} markers
	result = result.replace(atBlockOpenRe, '{');

	// 3. Convert reactive declarations:  let &[name]  →  let name
	result = result.replace(reactiveDeclRe, '$1 $2');

	// 4. Strip @-directive wrappers, keeping the brace
	//    @if (expr) {   →   {
	//    } @else if (expr) {   →   }{
	//    } @else {   →   }{
	//    } @empty {   →   }{
	//    @for (decl; key) {   →   {
	result = result.replace(
		directiveOpenRe,
		(match, directiveWithArgs, elseEmpty, brace) => {
			// The directive name and parenthesized args are dropped.
			// All we keep is the brace (which opens the body block).
			return brace;
		}
	);

	return result;
}
