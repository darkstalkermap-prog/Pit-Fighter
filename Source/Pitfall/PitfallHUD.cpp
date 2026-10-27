#include "PitfallHUD.h"
#include "Knight.h"
#include "Engine/Canvas.h"
#include "GameFramework/PlayerController.h"
void APitfallHUD::DrawHUD()
{
    Super::DrawHUD();
    if (!Canvas || !PlayerOwner) return;
    const AKnight* Knight = Cast<AKnight>(PlayerOwner->GetPawn());
    DrawText(TEXT("PITFALL | Blood Pit — Knight prototype"),FLinearColor::White,30,25);
    DrawText(TEXT("WASD move | Mouse look | LMB release: attack | Hold LMB 0.35s: heavy | RMB: block"),FLinearColor::White,30,50);
    DrawText(TEXT("+"),FLinearColor::White,Canvas->ClipX*.5f,Canvas->ClipY*.5f);
    if (!Knight) return;
    const float Y = Canvas->ClipY-100;
    DrawRect(FLinearColor(.08f,.08f,.08f),30,Y,300,22);
    DrawRect(FLinearColor(.65f,.05f,.04f),30,Y,300*FMath::Clamp(Knight->Health/FMath::Max(1.f,Knight->Tuning.Health),0.f,1.f),22);
    DrawRect(FLinearColor(.08f,.08f,.08f),30,Y+30,300,18);
    DrawRect(FLinearColor(.1f,.6f,.25f),30,Y+30,300*FMath::Clamp(Knight->Stamina/FMath::Max(1.f,Knight->Tuning.Stamina),0.f,1.f),18);
    DrawText(FString::Printf(TEXT("Health %.0f | Stamina %.0f | %s"),Knight->Health,Knight->Stamina,Knight->bBlocking?TEXT("BLOCKING"):TEXT("")),FLinearColor::White,30,Y-25);
    if (Knight->Health <= 0) DrawText(TEXT("You fell. Respawning in 3 seconds..."),FLinearColor::White,Canvas->ClipX*.35f,Canvas->ClipY*.4f);
}
