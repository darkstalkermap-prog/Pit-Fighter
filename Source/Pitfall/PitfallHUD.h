#pragma once
#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "PitfallHUD.generated.h"
UCLASS()
class PITFALL_API APitfallHUD : public AHUD
{
    GENERATED_BODY()
public:
    virtual void DrawHUD() override;
};
