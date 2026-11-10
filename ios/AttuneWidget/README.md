# Attune widget (needs Xcode setup)

The Swift source is ready, but Xcode must create the widget target and App Group
(this can't be done safely by editing the project file by hand):

1. Xcode -> File -> New -> Target -> Widget Extension, name `AttuneWidget`. Live Activity / Control / Configuration options may stay ticked.
2. Add `AttuneWidget.swift` from this folder to the widget target (drag it in, tick the widget target). It defines `AttuneSummaryWidget` and has no `@main`.
3. Open the generated `AttuneWidgetBundle.swift` (the one with `@main`) and add `AttuneSummaryWidget()` inside its `body`. You can delete the generated sample widget file(s) and remove them from the bundle, or keep them to compare.
4. For BOTH the App target and the widget target: Signing & Capabilities -> + App Groups -> `group.com.sriram.attune`.
5. Register URL scheme `attune` on the App target (Info -> URL Types).
6. The web app must write the snapshot keys (`caloriesLeft`, `calorieGoal`, `proteinLeft`, `carbsLeft`, `fatLeft`,
   `fastStart`, `fastTargetHours`) to that App Group's UserDefaults, which needs a small Capacitor plugin
   (not written yet) and `attune://` deep-link handling for the water button.
