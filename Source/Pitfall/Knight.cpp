#include "Knight.h"
#include "Engine/World.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/GameStateBase.h"
#include "GameFramework/GameModeBase.h"
#include "Components/StaticMeshComponent.h"
#include "Components/InputComponent.h"
#include "Components/CapsuleComponent.h"
#include "GameFramework/Controller.h"
#include "GameFramework/DamageType.h"
#include "Kismet/GameplayStatics.h"
#include "Net/UnrealNetwork.h"
#include "UObject/ConstructorHelpers.h"
#include "TimerManager.h"

AKnight::AKnight()
{
    PrimaryActorTick.bCanEverTick = true;
    bReplicates = true;
    GetCapsuleComponent()->SetCollisionResponseToChannel(ECC_Visibility, ECR_Block);
    bUseControllerRotationYaw = true;
    GetCharacterMovement()->MaxWalkSpeed = 420.f;
    Boom = CreateDefaultSubobject<USpringArmComponent>(TEXT("Boom"));
    Boom->SetupAttachment(RootComponent);
    Boom->TargetArmLength = 360.f;
    Boom->SocketOffset = FVector(0, 65, 60);
    Boom->bUsePawnControlRotation = true;
    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
    Camera->SetupAttachment(Boom);
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
    Body = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("PlaceholderArmor"));
    Body->SetupAttachment(RootComponent);
    Body->SetStaticMesh(Cube.Object);
    Body->SetRelativeScale3D(FVector(.5,.65,1.3));
    Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Sword = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("PlaceholderSword"));
    Sword->SetupAttachment(RootComponent);
    Sword->SetStaticMesh(Cube.Object);
    Sword->SetRelativeScale3D(FVector(1.5,.06,.12));
    Sword->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Shield = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("PlaceholderShield"));
    Shield->SetupAttachment(RootComponent);
    Shield->SetStaticMesh(Cube.Object);
    Shield->SetRelativeScale3D(FVector(.12,.55,.7));
    Shield->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}
void AKnight::BeginPlay()
{
    Super::BeginPlay();
    if (HasAuthority()) { Health = Tuning.Health; Stamina = Tuning.Stamina; }
}
void AKnight::GetLifetimeReplicatedProps(TArray<FLifetimeProperty>& Out) const
{
    Super::GetLifetimeReplicatedProps(Out);
    DOREPLIFETIME(AKnight, Health); DOREPLIFETIME(AKnight, Stamina);
    DOREPLIFETIME(AKnight, bBlocking); DOREPLIFETIME(AKnight, bHeavy);
    DOREPLIFETIME(AKnight, Phase); DOREPLIFETIME(AKnight, PhaseStarted);
}
float AKnight::ServerTime() const
{
    const AGameStateBase* GS = GetWorld()->GetGameState();
    return GS ? GS->GetServerWorldTimeSeconds() : GetWorld()->GetTimeSeconds();
}
void AKnight::SetupPlayerInputComponent(UInputComponent* Input)
{
    Super::SetupPlayerInputComponent(Input);
    Input->BindAxis("Forward", this, &AKnight::Forward);
    Input->BindAxis("Right", this, &AKnight::Right);
    Input->BindAxis("Turn", this, &APawn::AddControllerYawInput);
    Input->BindAxis("Look", this, &APawn::AddControllerPitchInput);
    Input->BindAction("Attack", IE_Pressed, this, &AKnight::AttackPressed);
    Input->BindAction("Attack", IE_Released, this, &AKnight::AttackReleased);
    Input->BindAction("Block", IE_Pressed, this, &AKnight::BlockPressed);
    Input->BindAction("Block", IE_Released, this, &AKnight::BlockReleased);
}
void AKnight::Forward(float V) { if (Health > 0) AddMovementInput(FRotationMatrix(FRotator(0,GetControlRotation().Yaw,0)).GetUnitAxis(EAxis::X), V); }
void AKnight::Right(float V) { if (Health > 0) AddMovementInput(FRotationMatrix(FRotator(0,GetControlRotation().Yaw,0)).GetUnitAxis(EAxis::Y), V); }
void AKnight::AttackPressed() { PressTime = GetWorld()->GetTimeSeconds(); bAttackHeld = true; }
void AKnight::AttackReleased()
{
    if (bAttackHeld) ServerAttack(GetWorld()->GetTimeSeconds() - PressTime >= .35f);
    bAttackHeld = false;
}
void AKnight::BlockPressed() { ServerBlock(true); }
void AKnight::BlockReleased() { ServerBlock(false); }
void AKnight::SetPhase(ECombatPhase P) { Phase = P; PhaseStarted = ServerTime(); ForceNetUpdate(); }
void AKnight::ServerAttack_Implementation(bool Heavy)
{
    const float Cost = Heavy ? Tuning.HeavyCost : Tuning.LightCost;
    if (Health <= 0 || Phase != ECombatPhase::Idle || bBlocking || Stamina < Cost) return;
    bHeavy = Heavy; Stamina -= Cost; RegenAfter = ServerTime() + 1.f;
    HitActors.Empty(); LastTraceAlpha = 0.f; SetPhase(ECombatPhase::Windup);
}
void AKnight::ServerBlock_Implementation(bool Block)
{
    if (!Block) bBlocking = false;
    else if (Health > 0 && Phase == ECombatPhase::Idle && Stamina > 0) bBlocking = true;
    ForceNetUpdate();
}
void AKnight::TraceSwing(float From, float To)
{
    // Subdivide the swept blade arc so low server frame rates do not skip targets.
    const int32 Steps = FMath::Max(1, FMath::CeilToInt((To-From)*24.f));
    FCollisionQueryParams Params(SCENE_QUERY_STAT(SwordTrace), false, this);
    for (int32 I=0; I<=Steps; ++I)
    {
        const float Alpha = FMath::Lerp(From,To,float(I)/Steps);
        const FVector Direction = FRotator(0, GetActorRotation().Yaw + FMath::Lerp(-65.f,65.f,Alpha),0).Vector();
        const FVector Start = GetActorLocation() + FVector(0,0,20);
        FHitResult Hit;
        if (GetWorld()->SweepSingleByChannel(Hit, Start, Start + Direction*Tuning.Reach,
            FQuat::Identity, ECC_Visibility, FCollisionShape::MakeSphere(15.f), Params))
        {
            AActor* Victim = Hit.GetActor();
            if (Victim && !HitActors.Contains(Victim))
            {
                HitActors.Add(Victim);
                UGameplayStatics::ApplyDamage(Victim, bHeavy ? Tuning.HeavyDamage : Tuning.LightDamage,
                    GetController(), this, UDamageType::StaticClass());
            }
        }
    }
}
void AKnight::Tick(float Dt)
{
    Super::Tick(Dt);
    const float Now = ServerTime();
    const float ReleaseDuration = FMath::Max(.05f,Tuning.Release);
    if (HasAuthority() && Health > 0)
    {
        if (bBlocking)
        {
            Stamina = FMath::Max(0.f, Stamina - Tuning.BlockDrain*Dt);
            RegenAfter = Now + .75f;
            if (Stamina <= 0) bBlocking = false;
        }
        else if (Phase == ECombatPhase::Idle && Now >= RegenAfter)
            Stamina = FMath::Min(Tuning.Stamina, Stamina + Tuning.Regen*Dt);
        const float Elapsed = Now - PhaseStarted;
        const float Mult = bHeavy ? Tuning.HeavyMultiplier : 1.f;
        if (Phase == ECombatPhase::Windup && Elapsed >= Tuning.Windup*Mult) SetPhase(ECombatPhase::Release);
        else if (Phase == ECombatPhase::Release)
        {
            const float Alpha = FMath::Clamp(Elapsed/ReleaseDuration,0.f,1.f);
            TraceSwing(LastTraceAlpha, Alpha); LastTraceAlpha = Alpha;
            if (Alpha >= 1.f) SetPhase(ECombatPhase::Recovery);
        }
        else if (Phase == ECombatPhase::Recovery && Elapsed >= Tuning.Recovery*Mult) SetPhase(ECombatPhase::Idle);
    }
    // Procedural placeholder pose; Blueprint animation can consume the replicated phase.
    float Angle = 25.f;
    if (Phase == ECombatPhase::Windup) Angle = -65.f;
    else if (Phase == ECombatPhase::Release) Angle = FMath::Lerp(-65.f,65.f,FMath::Clamp((Now-PhaseStarted)/ReleaseDuration,0.f,1.f));
    Sword->SetRelativeRotation(FRotator(0,Angle,0));
    Sword->SetRelativeLocation(FRotator(0,Angle,0).Vector()*90.f + FVector(0,0,20));
    Shield->SetRelativeLocation(bBlocking ? FVector(45,0,15) : FVector(0,-45,0));
    Body->SetRelativeRotation(Health <= 0 ? FRotator(0,0,80) : FRotator::ZeroRotator);
}
float AKnight::TakeDamage(float Damage, const FDamageEvent& Event, AController* Instigator, AActor* Causer)
{
    if (!HasAuthority() || Health <= 0 || Damage <= 0 || !Causer || Causer == this) return 0.f;
    const FVector Incoming = (Causer->GetActorLocation()-GetActorLocation()).GetSafeNormal2D();
    if (bBlocking && FVector::DotProduct(GetActorForwardVector(),Incoming) >= .5f)
    {
        RegenAfter = ServerTime()+1.f;
        if (Stamina >= Tuning.BlockCost) { Stamina -= Tuning.BlockCost; return 0.f; }
        Stamina = 0; bBlocking = false;
    }
    const float Applied = FMath::Min(Health,Damage*(1.f-FMath::Clamp(Tuning.ArmorReduction,0.f,.9f)));
    Health -= Applied;
    if (Health <= 0)
    {
        bBlocking = false; SetPhase(ECombatPhase::Dead);
        GetCharacterMovement()->DisableMovement();
        // Keep the controller attached for the death camera, then restart via the game mode.
        FTimerHandle Handle;
        GetWorldTimerManager().SetTimer(Handle, FTimerDelegate::CreateWeakLambda(this,[this]()
        {
            AController* OwnerController = GetController();
            if (OwnerController)
            {
                OwnerController->UnPossess();
                if (AGameModeBase* Mode = GetWorld()->GetAuthGameMode()) Mode->RestartPlayer(OwnerController);
            }
            Destroy();
        }),3.f,false);
    }
    ForceNetUpdate();
    return Applied;
}
