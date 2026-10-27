#pragma once
#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "PitfallGameMode.generated.h"
UCLASS()
class PITFALL_API APitfallGameMode : public AGameModeBase
{
    GENERATED_BODY()
public:
    APitfallGameMode();
    virtual void InitGame(const FString& MapName, const FString& Options, FString& ErrorMessage) override;
    virtual AActor* ChoosePlayerStart_Implementation(AController* Player) override;
private:
    UPROPERTY() TArray<TObjectPtr<AActor>> Starts;
    int32 NextStart = 0;
};
