#include "PitfallGameMode.h"
#include "Engine/World.h"
#include "BloodPit.h"
#include "Knight.h"
#include "PitfallHUD.h"
#include "GameFramework/PlayerStart.h"
#include "EngineUtils.h"
APitfallGameMode::APitfallGameMode()
{
    DefaultPawnClass = AKnight::StaticClass();
    HUDClass = APitfallHUD::StaticClass();
}
void APitfallGameMode::InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage)
{
    Super::InitGame(MapName,Options,ErrorMessage);
    GetWorld()->SpawnActor<ABloodPit>();
    for (int32 I=0; I<12; ++I)
    {
        const float Angle = I*30.f;
        const FVector Position = FRotator(0,Angle,0).Vector()*1100.f+FVector(0,0,110);
        Starts.Add(GetWorld()->SpawnActor<APlayerStart>(Position,FRotator(0,Angle+180,0)));
    }
}
AActor* APitfallGameMode::ChoosePlayerStart_Implementation(AController* Player)
{
    if (Starts.IsEmpty()) return Super::ChoosePlayerStart_Implementation(Player);
    // Prefer the spawn farthest from living fighters, avoiding immediate respawn overlaps.
    AActor* Best = Starts[NextStart++ % Starts.Num()];
    float BestDistance = -1;
    for (AActor* Start : Starts)
    {
        float Nearest = TNumericLimits<float>::Max();
        for (TActorIterator<AKnight> It(GetWorld()); It; ++It)
            if (It->Health > 0) Nearest = FMath::Min(Nearest,FVector::DistSquared(Start->GetActorLocation(),It->GetActorLocation()));
        if (Nearest > BestDistance) { BestDistance = Nearest; Best = Start; }
    }
    return Best;
}
