#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "Knight.generated.h"

UENUM(BlueprintType)
enum class ECombatPhase : uint8 { Idle, Windup, Release, Recovery, Dead };

USTRUCT(BlueprintType)
struct FKnightTuning
{
    GENERATED_BODY()
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Health = 150.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Stamina = 100.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Regen = 22.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float LightDamage = 25.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float HeavyDamage = 45.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float LightCost = 18.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float HeavyCost = 32.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float BlockCost = 25.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float BlockDrain = 8.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float ArmorReduction = .2f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Reach = 180.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Windup = .22f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Release = .22f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float Recovery = .35f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite) float HeavyMultiplier = 1.6f;
};

UCLASS(Blueprintable)
class PITFALL_API AKnight : public ACharacter
{
    GENERATED_BODY()
public:
    AKnight();
    virtual void Tick(float DeltaSeconds) override;
    virtual void BeginPlay() override;
    virtual void SetupPlayerInputComponent(UInputComponent* Input) override;
    virtual void GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& Out) const override;
    virtual float TakeDamage(float Damage, const FDamageEvent& Event, AController* Instigator, AActor* Causer) override;
    UPROPERTY(EditDefaultsOnly, BlueprintReadOnly, Category="Combat") FKnightTuning Tuning;
    UPROPERTY(Replicated, BlueprintReadOnly) float Health = 150.f;
    UPROPERTY(Replicated, BlueprintReadOnly) float Stamina = 100.f;
    UPROPERTY(Replicated, BlueprintReadOnly) bool bBlocking = false;
    UPROPERTY(Replicated, BlueprintReadOnly) bool bHeavy = false;
    UPROPERTY(Replicated, BlueprintReadOnly) ECombatPhase Phase = ECombatPhase::Idle;
    UPROPERTY(Replicated, BlueprintReadOnly) float PhaseStarted = 0.f;
protected:
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<class USpringArmComponent> Boom;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<class UCameraComponent> Camera;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<class UStaticMeshComponent> Body;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<class UStaticMeshComponent> Sword;
    UPROPERTY(VisibleAnywhere, BlueprintReadOnly) TObjectPtr<class UStaticMeshComponent> Shield;
    UFUNCTION(Server, Reliable) void ServerAttack(bool Heavy);
    UFUNCTION(Server, Reliable) void ServerBlock(bool Block);
private:
    void Forward(float Value);
    void Right(float Value);
    void AttackPressed();
    void AttackReleased();
    void BlockPressed();
    void BlockReleased();
    void SetPhase(ECombatPhase NewPhase);
    void TraceSwing(float FromAlpha, float ToAlpha);
    float ServerTime() const;
    float PressTime = 0.f;
    bool bAttackHeld = false;
    float LastTraceAlpha = 0.f;
    float RegenAfter = 0.f;
    TSet<TWeakObjectPtr<AActor>> HitActors;
};
