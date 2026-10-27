using UnrealBuildTool;
public class PitfallServerTarget : TargetRules
{
    public PitfallServerTarget(TargetInfo Target) : base(Target)
    {
        Type = TargetType.Server;
        DefaultBuildSettings = BuildSettingsVersion.V6;
        IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_7;
        ExtraModuleNames.Add("Pitfall");
    }
}
