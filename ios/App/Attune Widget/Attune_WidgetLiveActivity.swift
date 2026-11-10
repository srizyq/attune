//
//  Attune_WidgetLiveActivity.swift
//  Attune Widget
//
//  Created by Sriram Chalamalla on 10/11/2026.
//

import ActivityKit
import WidgetKit
import SwiftUI

struct Attune_WidgetAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        // Dynamic stateful properties about your activity go here!
        var emoji: String
    }

    // Fixed non-changing properties about your activity go here!
    var name: String
}

struct Attune_WidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: Attune_WidgetAttributes.self) { context in
            // Lock screen/banner UI goes here
            VStack {
                Text("Hello \(context.state.emoji)")
            }
            .activityBackgroundTint(Color.cyan)
            .activitySystemActionForegroundColor(Color.black)

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI goes here.  Compose the expanded UI through
                // various regions, like leading/trailing/center/bottom
                DynamicIslandExpandedRegion(.leading) {
                    Text("Leading")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("Trailing")
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("Bottom \(context.state.emoji)")
                    // more content
                }
            } compactLeading: {
                Text("L")
            } compactTrailing: {
                Text("T \(context.state.emoji)")
            } minimal: {
                Text(context.state.emoji)
            }
            .widgetURL(URL(string: "http://www.apple.com"))
            .keylineTint(Color.red)
        }
    }
}

extension Attune_WidgetAttributes {
    fileprivate static var preview: Attune_WidgetAttributes {
        Attune_WidgetAttributes(name: "World")
    }
}

extension Attune_WidgetAttributes.ContentState {
    fileprivate static var smiley: Attune_WidgetAttributes.ContentState {
        Attune_WidgetAttributes.ContentState(emoji: "😀")
     }
     
     fileprivate static var starEyes: Attune_WidgetAttributes.ContentState {
         Attune_WidgetAttributes.ContentState(emoji: "🤩")
     }
}

#Preview("Notification", as: .content, using: Attune_WidgetAttributes.preview) {
   Attune_WidgetLiveActivity()
} contentStates: {
    Attune_WidgetAttributes.ContentState.smiley
    Attune_WidgetAttributes.ContentState.starEyes
}
