import Foundation
import JavaScriptCore

/// Errors the JavaScript side can raise into Swift.
public enum KhaytJSError: Error, CustomStringConvertible {
    case moduleMissing(String)
    case evaluationFailed(String)
    case unexpectedResult(String)

    public var description: String {
        switch self {
        case .moduleMissing(let m):      return "KhaytCore: bundled module missing: \(m)"
        case .evaluationFailed(let m):   return "KhaytCore: \(m)"
        case .unexpectedResult(let m):   return "KhaytCore: unexpected result: \(m)"
        }
    }
}

/// One JavaScriptCore context holding Khayt's shared business logic.
///
/// The modules are IIFEs that assign themselves onto `globalThis` — `KhaytTax`,
/// `KhaytPricing`, `KhaytPaymentPlan` and so on — which is exactly how the
/// renderer loads them from `<script>` tags. Nothing about them is changed to
/// run here.
///
/// NOT thread-safe on its own: a `JSContext` must be used from one thread at a
/// time. `KhaytEngine` owns the serialisation; this type is deliberately the
/// thin, testable part.
public final class JSRuntime {
    private let context: JSContext
    private var lastException: String?

    /// Load `modules` in order, from `bundle`'s `JS` resource directory.
    ///
    /// `bundle` is optional rather than defaulted to `.module`: SPM generates
    /// that accessor as internal, so it cannot appear in a public signature.
    public init(modules: [String], bundle: Bundle? = nil) throws {
        let bundle = bundle ?? .module
        guard let context = JSContext() else {
            throw KhaytJSError.evaluationFailed("could not create a JavaScript context")
        }
        self.context = context
        context.exceptionHandler = { [weak self] _, value in
            self?.lastException = value?.toString() ?? "unknown JavaScript exception"
        }

        for module in modules {
            guard let url = bundle.url(forResource: module, withExtension: "js", subdirectory: "JS") else {
                throw KhaytJSError.moduleMissing("\(module).js")
            }
            let source = try String(contentsOf: url, encoding: .utf8)
            lastException = nil
            context.evaluateScript(source, withSourceURL: url)
            if let problem = lastException {
                throw KhaytJSError.evaluationFailed("loading \(module).js: \(problem)")
            }
            // A module that loaded without throwing but defined nothing is a
            // packaging mistake, and it would otherwise surface much later as a
            // confusing "undefined is not an object" from a call site.
            guard context.objectForKeyedSubscript(Self.globalName(for: module))?.isUndefined == false else {
                throw KhaytJSError.moduleMissing("\(module).js loaded but defined no global")
            }
        }
    }

    /// `lib/payment-plan.js` → `KhaytPaymentPlan`. Mirrors each module's own
    /// `global.X = api` line; a module whose global does not follow the pattern
    /// is listed here explicitly rather than guessed at.
    static func globalName(for module: String) -> String {
        let exceptions = ["store-validate": "KhaytStoreValidate"]
        if let known = exceptions[module] { return known }
        let camel = module.split(separator: "-").map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined()
        return "Khayt\(camel)"
    }

    /// Evaluate an expression and hand back the raw value.
    @discardableResult
    public func evaluate(_ script: String) throws -> JSValue {
        lastException = nil
        let value = context.evaluateScript(script)
        if let problem = lastException { throw KhaytJSError.evaluationFailed(problem) }
        guard let value else { throw KhaytJSError.unexpectedResult("no value") }
        return value
    }

    /// Call `object.method(args…)` and decode the result as `T`.
    ///
    /// Arguments and results cross as JSON, not as bridged objects. It is
    /// slower, and it means a shape change on either side is a decoding error
    /// here rather than a silently missing field somewhere downstream — which
    /// is the failure this codebase keeps having.
    public func call<T: Decodable>(_ object: String, _ method: String, _ args: [Encodable] = [], as type: T.Type) throws -> T {
        let encoder = JSONEncoder()
        let encoded = try args.map { arg -> String in
            let data = try encoder.encode(AnyEncodable(arg))
            return String(data: data, encoding: .utf8) ?? "null"
        }
        let call = "JSON.stringify(\(object).\(method)(\(encoded.joined(separator: ", "))))"
        let value = try evaluate(call)
        guard let json = value.toString(), json != "undefined", let data = json.data(using: .utf8) else {
            throw KhaytJSError.unexpectedResult("\(object).\(method) returned undefined")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// Read `object.property` and decode it as `T`. Same JSON crossing as
    /// `call`, for the modules that export data rather than functions.
    public func value<T: Decodable>(_ object: String, _ property: String, as type: T.Type) throws -> T {
        let js = try evaluate("JSON.stringify(\(object).\(property))")
        guard let json = js.toString(), json != "undefined", let data = json.data(using: .utf8) else {
            throw KhaytJSError.unexpectedResult("\(object).\(property) is undefined")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

/// Type-erasing wrapper so heterogeneous arguments can be JSON-encoded.
struct AnyEncodable: Encodable {
    private let encodeTo: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { encodeTo = wrapped.encode(to:) }
    func encode(to encoder: Encoder) throws { try encodeTo(encoder) }
}
