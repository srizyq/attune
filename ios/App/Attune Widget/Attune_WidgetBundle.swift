//
//  Attune_WidgetBundle.swift
//  Attune Widget
//
//  Created by Sriram Chalamalla on 10/11/2026.
//

import WidgetKit
import SwiftUI

@main
struct Attune_WidgetBundle: WidgetBundle {
    var body: some Widget {
        Attune_Widget()
        Attune_WidgetControl()
        Attune_WidgetLiveActivity()
    }
}
