#include "BloodPit.h"
#include "Engine/World.h"
#include "Components/StaticMeshComponent.h"
#include "Components/PointLightComponent.h"
#include "UObject/ConstructorHelpers.h"
ABloodPit::ABloodPit()
{
    bReplicates = true;
    bAlwaysRelevant = true;
    RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
    auto Box = [&](FName Name, FVector Position, FVector Scale, float Yaw)
    {
        UStaticMeshComponent* Mesh = CreateDefaultSubobject<UStaticMeshComponent>(Name);
        Mesh->SetupAttachment(RootComponent);
        Mesh->SetStaticMesh(Cube.Object);
        Mesh->SetRelativeLocation(Position);
        Mesh->SetRelativeScale3D(Scale);
        Mesh->SetRelativeRotation(FRotator(0,Yaw,0));
        Mesh->SetCollisionProfileName(TEXT("BlockAll"));
    };
    Box(TEXT("Floor"),FVector(0,0,-50),FVector(32,32,1),0);
    for (int32 I=0; I<24; ++I)
    {
        const float A = I*15.f;
        const FVector D = FRotator(0,A,0).Vector();
        Box(FName(*FString::Printf(TEXT("Wall%d"),I)),D*1450+FVector(0,0,200),FVector(.8,4,4),A);
    }
    for (int32 I=0; I<4; ++I)
    {
        const FVector D = FRotator(0,45+I*90,0).Vector();
        Box(FName(*FString::Printf(TEXT("Pillar%d"),I)),D*850+FVector(0,0,180),FVector(1.2,1.2,3.6),0);
        UPointLightComponent* Light = CreateDefaultSubobject<UPointLightComponent>(FName(*FString::Printf(TEXT("Light%d"),I)));
        Light->SetupAttachment(RootComponent);
        Light->SetRelativeLocation(D*650+FVector(0,0,500));
        Light->SetIntensity(18000.f);
        Light->SetAttenuationRadius(2400.f);
        Light->SetLightColor(FLinearColor(1.f,.8f,.55f));
    }
}
