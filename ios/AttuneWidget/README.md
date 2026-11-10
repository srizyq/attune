# Attune widget (needs Xcode setup)

The Swift source is ready, but Xcode must create the widget target and App Group
(this can't be done safely by editing the project file by hand):

1. Xcode → File → New → Target → Widget Extension, name `AttuneWidget` (untick "Include Live Activity/Configuration").
2. Replace the generated Swift file with `AttuneWidget.swift` from this folder.
3. For BOTH the App target and the widget target: Signing & Capabilities → + App Groups → `group.com.sriram.attune`.
4. Register URL scheme `attune` on the App target (Info → URL Types).
5. The web app must write the snapshot keys (`caloriesLeft`, `calorieGoal`, `proteinLeft`, `carbsLeft`, `fatLeft`,
   `fastStart`, `fastTargetHours`) to that App Group's UserDefaults, which needs a small Capacitor plugin
   (not written yet) and the `attune://` deep-link handling for the water button.
