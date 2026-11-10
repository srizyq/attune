import UIKit
import Capacitor
import WidgetKit

// Shared with the home-screen widget (target "Attune Widget") through this App Group.
let attuneAppGroup = "group.com.sriram.attune"

// Lets the web app hand the widget its numbers and receive the widget's taps
// (attune://water, attune://dashboard). JS name: "WidgetBridge".
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePendingUrl", returnType: CAPPluginReturnPromise),
    ]

    static weak var shared: WidgetBridgePlugin?
    // A link that arrived before the web app was ready to hear about it.
    static var pendingURL: String?

    public override func load() { WidgetBridgePlugin.shared = self }

    @objc func setSnapshot(_ call: CAPPluginCall) {
        let d = UserDefaults(suiteName: attuneAppGroup)
        for key in ["caloriesLeft", "calorieGoal", "proteinLeft", "carbsLeft", "fatLeft"] {
            d?.set(call.getInt(key) ?? 0, forKey: key)
        }
        d?.set(call.getDouble("fastStart") ?? 0, forKey: "fastStart")
        d?.set(call.getDouble("fastTargetHours") ?? 16, forKey: "fastTargetHours")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    @objc func consumePendingUrl(_ call: CAPPluginCall) {
        let url = WidgetBridgePlugin.pendingURL
        WidgetBridgePlugin.pendingURL = nil
        call.resolve(["url": url as Any])
    }

    static func deliver(_ url: URL) {
        guard url.scheme == "attune" else { return }
        if let plugin = shared {
            plugin.notifyListeners("urlOpen", data: ["url": url.absoluteString])
        } else {
            pendingURL = url.absoluteString
        }
    }
}

class AttuneBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = AttuneBridgeViewController()
        window?.makeKeyAndVisible()

        // Launched by tapping the widget: remember the link until the web app asks for it.
        for context in connectionOptions.urlContexts { WidgetBridgePlugin.pendingURL = context.url.absoluteString }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts { WidgetBridgePlugin.deliver(context.url) }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
