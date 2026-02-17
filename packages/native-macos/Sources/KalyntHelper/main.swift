import Foundation
#if os(macOS)
import CoreML
import NaturalLanguage
#endif

// MARK: - JSON-RPC Types

struct JSONRPCRequest: Codable {
    let jsonrpc: String
    let id: Int?
    let method: String
    let params: [String: AnyCodable]?
}

struct JSONRPCNotification: Codable {
    let jsonrpc: String = "2.0"
    let method: String
    let params: [String: AnyCodable]?
}

struct JSONRPCResponse: Codable {
    let jsonrpc: String = "2.0"
    let id: Int
    let result: [String: AnyCodable]?
    let error: JSONRPCError?
}

struct JSONRPCError: Codable {
    let code: Int
    let message: String
}

// Helper for dynamic JSON
struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let x = try? container.decode(String.self) { value = x }
        else if let x = try? container.decode(Int.self) { value = x }
        else if let x = try? container.decode(Double.self) { value = x }
        else if let x = try? container.decode(Bool.self) { value = x }
        else if let x = try? container.decode([String: AnyCodable].self) { value = x.mapValues { $0.value } }
        else if let x = try? container.decode([AnyCodable].self) { value = x.map { $0.value } }
        else { throw DecodingError.typeMismatch(AnyCodable.self, DecodingError.Context(codingPath: decoder.codingPath, debugDescription: "Unsupported type")) }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        if let x = value as? String { try container.encode(x) }
        else if let x = value as? Int { try container.encode(x) }
        else if let x = value as? Double { try container.encode(x) }
        else if let x = value as? Bool { try container.encode(x) }
        else if let x = value as? [String: Any] { try container.encode(x.mapValues { AnyCodable($0) }) }
        else if let x = value as? [Any] { try container.encode(x.map { AnyCodable($0) }) }
    }
}

// MARK: - File Watcher (FSEvents)

class FileWatcher {
    private var stream: FSEventStreamRef?
    private let callback: (String, UInt32) -> Void

    init(callback: @escaping (String, UInt32) -> Void) {
        self.callback = callback
    }

    func start(path: String) {
        stop()

        let paths = [path] as CFArray
        var context = FSEventStreamContext(version: 0, info: UnsafeMutableRawPointer(Unmanaged.passUnretained(self).toOpaque()), retain: nil, release: nil, copyDescription: nil)

        let streamCallback: FSEventStreamCallback = { (stream, contextInfo, numEvents, eventPaths, eventFlags, eventIds) in
            let watcher = Unmanaged<FileWatcher>.fromOpaque(contextInfo!).takeUnretainedValue()
            let paths = Unmanaged<CFArray>.fromOpaque(eventPaths).takeUnretainedValue() as! [String]

            for i in 0..<numEvents {
                watcher.callback(paths[i], eventFlags[i])
            }
        }

        stream = FSEventStreamCreate(
            nil,
            streamCallback,
            &context,
            paths,
            FSEventStreamEventId(kFSEventStreamEventIdSinceNow),
            1.0, // Latency
            UInt32(kFSEventStreamCreateFlagFileEvents | kFSEventStreamCreateFlagNoDefer)
        )

        FSEventStreamScheduleWithRunLoop(stream!, CFRunLoopGetCurrent(), CFRunLoopMode.defaultMode.rawValue)
        FSEventStreamStart(stream!)
    }

    func stop() {
        if let s = stream {
            FSEventStreamStop(s)
            FSEventStreamInvalidate(s)
            FSEventStreamRelease(s)
            stream = nil
        }
    }
}

// MARK: - CoreML Inference Engine

class InferenceEngine {
    private var model: Any? // Placeholder for MLModel

    func loadModel(path: String) throws -> Bool {
        #if os(macOS)
        let modelURL = URL(fileURLWithPath: path)
        // In a real implementation, we'd use MLModel.compileModel(at:) then MLModel(contentsOf:)
        // For now, we stub the logic
        return true
        #else
        return false
        #endif
    }

    func generate(prompt: String, maxTokens: Int) -> String {
        #if os(macOS)
        // Stub for CoreML inference logic
        return "CoreML Response: \(prompt.reversed())"
        #else
        return "Not supported"
        #endif
    }
}

// MARK: - Helper Core

class KalyntHelper {
    private var watcher: FileWatcher?
    private var inferenceEngine: InferenceEngine?
    private var buffer = Data()

    func start() {
        FileHandle.standardInput.readabilityHandler = { handle in
            let data = handle.availableData
            if data.isEmpty { return }
            self.buffer.append(data)
            self.processBuffer()
        }
        
        RunLoop.current.run()
    }

    private func processBuffer() {
        while let newlineIndex = buffer.firstIndex(of: UInt8(ascii: "\n")) {
            let lineData = buffer.prefix(upTo: newlineIndex)
            buffer.removeSubrange(0...newlineIndex)

            guard let request = try? JSONDecoder().decode(JSONRPCRequest.self, from: lineData) else {
                continue
            }
            handle(request: request)
        }
    }

    private func handle(request: JSONRPCRequest) {
        guard let id = request.id else { return }

        switch request.method {
        case "hardware-stats":
            getHardwareStats(id: id)
        case "watch-start":
            startWatching(id: id, params: request.params)
        case "watch-stop":
            stopWatching(id: id)
        case "llm-load":
            loadLLM(id: id, params: request.params)
        case "llm-predict":
            predictLLM(id: id, params: request.params)
        case "ping":
            sendResult(id: id, result: ["pong": true])
        default:
            sendError(id: id, message: "Method not found")
        }
    }

    private func getHardwareStats(id: Int) {
        var stats: [String: Any] = [:]
        #if os(macOS)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/system_profiler")
        process.arguments = ["SPDisplaysDataType", "-json"]
        let pipe = Pipe()
        process.standardOutput = pipe
        try? process.run()
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            stats["gpu"] = json
        }
        #endif
        sendResult(id: id, result: stats)
    }

    private func startWatching(id: Int, params: [String: AnyCodable]?) {
        guard let path = params?["path"]?.value as? String else {
            sendError(id: id, message: "Missing path parameter")
            return
        }
        if watcher == nil {
            watcher = FileWatcher { path, flags in
                self.sendNotification(method: "file-changed", params: ["path": path, "flags": Int(flags)])
            }
        }
        watcher?.start(path: path)
        sendResult(id: id, result: ["status": "watching", "path": path])
    }

    private func stopWatching(id: Int) {
        watcher?.stop()
        sendResult(id: id, result: ["status": "stopped"])
    }

    private func loadLLM(id: Int, params: [String: AnyCodable]?) {
        guard let path = params?["path"]?.value as? String else {
            sendError(id: id, message: "Missing path parameter")
            return
        }
        if inferenceEngine == nil {
            inferenceEngine = InferenceEngine()
        }
        do {
            let success = try inferenceEngine!.loadModel(path: path)
            sendResult(id: id, result: ["success": success])
        } catch {
            sendError(id: id, message: error.localizedDescription)
        }
    }

    private func predictLLM(id: Int, params: [String: AnyCodable]?) {
        guard let prompt = params?["prompt"]?.value as? String,
              let maxTokens = params?["maxTokens"]?.value as? Int else {
            sendError(id: id, message: "Missing parameters")
            return
        }
        let result = inferenceEngine?.generate(prompt: prompt, maxTokens: maxTokens) ?? "Engine not loaded"
        sendResult(id: id, result: ["text": result])
    }

    private func sendResult(id: Int, result: [String: Any]) {
        let response: [String: Any] = ["jsonrpc": "2.0", "id": id, "result": result]
        send(response)
    }

    private func sendNotification(method: String, params: [String: Any]) {
        let notification: [String: Any] = ["jsonrpc": "2.0", "method": method, "params": params]
        send(notification)
    }

    private func sendError(id: Int, message: String) {
        let response: [String: Any] = ["jsonrpc": "2.0", "id": id, "error": ["code": -32603, "message": message]]
        send(response)
    }

    private func send(_ dictionary: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: dictionary),
           let string = String(data: data, encoding: .utf8) {
            print(string)
            fflush(stdout)
        }
    }
}

let helper = KalyntHelper()
helper.start()
