# Laboratorio empresarial Active Directory + LDAP

Guía técnica revisada · v2.0 · 7 octubre 2026

## Índice

- [01 · Alcance y decisiones de diseño](#fase-00)
- [02 · Arquitectura e inventario](#fase-01)
- [03 · Preparación, red virtual y requisitos](#fase-02)
- [04 · Fase 1: DC01 y creación del bosque](#fase-03)
- [05 · Fase 2: DNS, sitio y sincronización horaria](#fase-04)
- [06 · Fase 3: OU, usuarios, grupos y AGDLP](#fase-05)
- [07 · Fase 4: Windows 11 y Kerberos](#fase-06)
- [08 · Fase 5: GPO, contraseñas y validación](#fase-07)
- [09 · Fase 6: FS01, permisos SMB/NTFS y unidad V](#fase-08)
- [10 · Fase 7: DC02, replicación y DNS redundante](#fase-09)
- [11 · Fase 8: CA01 y emisión de certificados](#fase-10)
- [12 · Fase 9: Linux, confianza TLS y LDAP](#fase-11)
- [13 · Fase 10: unión de Linux con realmd/SSSD](#fase-12)
- [14 · Fase 11: APP01 e integración de aplicación](#fase-13)
- [15 · Puertos y flujos de comunicación](#fase-14)
- [16 · Tolerancia a fallos y pruebas controladas](#fase-15)
- [17 · Troubleshooting por síntoma](#fase-16)
- [18 · Seguridad, operaciones y recuperación](#fase-17)
- [19 · Matriz de aceptación y evidencias](#fase-18)
- [20 · Estructura del proyecto y uso de entregables](#fase-19)
- [21 · Referencias técnicas y control documental](#fase-20)

<a id="fase-00"></a>

## 01 · Alcance y decisiones de diseño

Este proyecto reproduce una infraestructura empresarial de identidad y recursos en un laboratorio virtual. El dominio es ad.lab.test, el nombre NetBIOS es LAB y la red es 10.10.10.0/24. La documentación define un procedimiento reproducible; no afirma que las máquinas hayan sido desplegadas ni que las pruebas de infraestructura hayan sido ejecutadas.

AD DS almacena identidades, equipos y configuración. DNS permite localizar controladores mediante registros SRV. Kerberos entrega tickets para la autenticación del dominio. LDAP consulta el directorio; LDAPS cifra el transporte LDAP con TLS. Las GPO se obtienen mediante AD y SYSVOL/SMB. Ninguno de estos componentes, por separado, sustituye al conjunto.

DC01 y DC02 son controladores escribibles, DNS y Global Catalog. No existe un DC primario para todas las operaciones: AD es multimáster, aunque determinadas tareas se asignan a roles FSMO. DC01 conservará inicialmente los cinco FSMO y será el PDC Emulator. FS01, APP01 y CA01 son servicios independientes y no adquieren alta disponibilidad por añadir un segundo DC.

La CA será Enterprise Root de un nivel, adecuada para aprendizaje. En producción deben revisarse la raíz offline, CA emisoras, políticas, separación administrativa, revocación, copias y recuperación. No conectar el laboratorio a una red corporativa, no reutilizar contraseñas reales y no publicar los puertos del dominio en Internet.

Cambios respecto al guion inicial: red única 10.10.10.0/24; promoción explícita de DC02; OU y alcance de GPO completos; ACL de ficheros con herencia controlada; consultas autenticadas únicamente con TLS o SASL protegido; validación TLS estricta; pruebas de fallo sin depender de login en caché; RPC dinámico y NTP documentados.

<a id="fase-01"></a>

## 02 · Arquitectura e inventario

```text
                 Internet (salida opcional)
                           |
                 NAT 10.10.10.1
                           |
                 LAB-AD 10.10.10.0/24
                           |
       +-------------------+-------------------+
       |                   |                   |
 DC01 .10 <----------> DC02 .11             FS01 .20
 AD DS/DNS/GC     AD + DNS + SYSVOL          SMB/NTFS
       |                   |
       +-------------------+----- CA01 .40 (AD CS)
                           |
          +----------------+----------------+
          |                |                |
     CLIENT01 .101    LINUX01 .102      APP01 .30
     Windows 11 Pro   Ubuntu + SSSD     demo LDAP/TLS
```

| Host / FQDN | Dirección | Sistema y rol | Recursos orientativos |
| --- | --- | --- | --- |
| DC01 / dc01.ad.lab.test | 10.10.10.10 | Server 2025, AD DS + DNS + GC | 2 vCPU, 4 GB, 60 GB |
| DC02 / dc02.ad.lab.test | 10.10.10.11 | Server 2025, AD DS + DNS + GC | 2 vCPU, 4 GB, 60 GB |
| FS01 / fs01.ad.lab.test | 10.10.10.20 | Server 2025, ficheros | 2 vCPU, 4 GB, SO 60 GB + datos 40 GB |
| APP01 / app01.ad.lab.test | 10.10.10.30 | Ubuntu Server 24.04 LTS, demo LDAP | 2 vCPU, 2 GB, 30 GB |
| CA01 / ca01.ad.lab.test | 10.10.10.40 | Server 2025, Enterprise Root CA | 2 vCPU, 4 GB, 60 GB |
| CLIENT01 / client01.ad.lab.test | 10.10.10.101 | Windows 11 Pro/Enterprise | 2-4 vCPU, 8 GB, 80 GB |
| LINUX01 / linux01.ad.lab.test | 10.10.10.102 | Ubuntu Server 24.04 LTS, LDAP + SSSD | 2 vCPU, 2 GB, 30 GB |

Todos usan máscara 255.255.255.0 y gateway 10.10.10.1. Los clientes usan DNS .10 y .11 cuando ambos estén operativos. Antes de DC02 usan solo .10. APP01 no necesita unirse al dominio para hacer bind LDAP; se publica su registro A manualmente.

Reservar .1 para NAT; .10-.49 para infraestructura; .100-.149 para clientes. .0 es dirección de red y .255 broadcast. No activar DHCP sobre estas direcciones. Si se usa DHCP, excluir todas las IP estáticas y publicar las opciones 003, 006 y 015 adecuadas.

El host debe disponer idealmente de 32 GB de RAM y 350 GB libres. Con 16 GB ejecutar por fases, priorizando DC01, DC02 y un cliente. Estas cifras son recomendaciones del laboratorio, no los requisitos mínimos oficiales de los sistemas.

<a id="fase-02"></a>

## 03 · Preparación, red virtual y requisitos

Crear VMs con ISO legítima y licencias o evaluación vigentes. Windows 11 requiere edición con unión a AD, UEFI, Secure Boot y TPM virtual compatibles. En Hyper-V usar generación 2. Mantener una única NIC por DC para evitar registros DNS y rutas ambiguas.

En Hyper-V, el siguiente ejemplo crea un switch interno y NAT. Ejecutarlo en el host como administrador, después de comprobar que no hay conflicto con una red, VPN o NAT existentes. No es aplicable directamente a VMware, Proxmox o VirtualBox: allí configurar una red equivalente en el hipervisor.
```powershell
Get-VMSwitch
Get-NetNat
New-VMSwitch -Name 'LAB-AD' -SwitchType Internal
New-NetIPAddress -InterfaceAlias 'vEthernet (LAB-AD)' `
  -IPAddress 10.10.10.1 -PrefixLength 24
New-NetNat -Name 'LAB-AD-NAT' `
  -InternalIPInterfaceAddressPrefix '10.10.10.0/24'
```
Conectar cada NIC de VM a LAB-AD. WinNAT no entrega DHCP por sí mismo. No crear reglas de entrada NAT. Para un laboratorio sin salida a Internet, omitir NAT y gateway y disponer de repositorios/actualizaciones locales. El gateway no es servidor DNS del dominio.

Actualizar las plantillas antes de promover DC01. Registrar ISO, versión/build, hipervisor, CPU/RAM, hostname, IP y fecha. Los comandos son secuenciales y muchos no son idempotentes: no repetir New-* tras una instalación parcial sin comprobar el estado. Los reinicios separan fases.

Ejecutar PowerShell elevado en el host indicado y Bash con sudo donde se especifica. Las interfaces pueden llamarse Ethernet, ens18 o enp0s3: descubrirlas antes de pegar comandos. Las contraseñas se introducen interactivamente; no guardarlas en el README, historial, capturas ni repositorio.

Puerta de avance: las VMs están en la red correcta; no hay IP duplicada; cada VM puede alcanzar .1 si existe NAT; se ha verificado la edición de Windows 11 y se dispone de acceso a consola y contraseña local de recuperación.

<a id="fase-03"></a>

## 04 · Fase 1: DC01 y creación del bosque

En DC01, renombrar y reiniciar antes de fijar la configuración. Comprobar el adaptador y sus direcciones: si tiene configuración estática previa, corregirla manualmente; no borrar todas las rutas o direcciones indiscriminadamente.
```powershell
Rename-Computer -NewName DC01 -Restart
# Continuar tras reinicio
Get-NetAdapter
Get-NetIPConfiguration
Set-NetIPInterface -InterfaceAlias Ethernet -AddressFamily IPv4 -Dhcp Disabled
New-NetIPAddress -InterfaceAlias Ethernet -IPAddress 10.10.10.10 `
  -PrefixLength 24 -DefaultGateway 10.10.10.1
Set-DnsClientServerAddress -InterfaceAlias Ethernet `
  -ServerAddresses 10.10.10.10
Install-WindowsFeature AD-Domain-Services -IncludeManagementTools
$dsrm = Read-Host 'Clave DSRM (guardar en gestor seguro)' -AsSecureString
Install-ADDSForest -DomainName ad.lab.test -DomainNetbiosName LAB `
  -InstallDNS -SafeModeAdministratorPassword $dsrm
```
La promoción reinicia el servidor. El aviso sobre delegación DNS del padre lab.test puede ser esperado en este bosque aislado: no existe una zona padre autoritativa integrada con otra organización. No ignorar otros fallos del análisis de requisitos.

No fijar niveles funcionales por copia de un guion antiguo. Examinar los valores elegidos por la versión instalada y su compatibilidad antes de introducir futuros DC de otra versión. Conservar el firewall habilitado; los roles añaden sus reglas necesarias.
```powershell
Get-ADDomain | Format-List DNSRoot,NetBIOSName,DomainMode,PDCEmulator
Get-ADForest | Format-List RootDomain,ForestMode,GlobalCatalogs
Get-ADDomainController -Filter *
Get-Service NTDS,DNS,Netlogon,DFSR
Get-SmbShare -Name SYSVOL,NETLOGON
dcdiag /test:dns /v
```
Puerta de avance: AD DS y DNS activos, SYSVOL y NETLOGON publicados, DC01 visible como DC y GC. Guardar la salida en una carpeta de evidencias sin secretos. No continuar si SYSVOL no está disponible.

<a id="fase-04"></a>

## 05 · Fase 2: DNS, sitio y sincronización horaria

El bosque crea zonas DNS integradas en AD. Utilizar actualizaciones dinámicas seguras. No sustituir los DNS del cliente por resolvers públicos: los reenviadores se configuran en el servicio DNS del DC, no en la NIC del equipo.
```powershell
Get-DnsServerZone
Add-DnsServerPrimaryZone -NetworkId '10.10.10.0/24' `
  -ReplicationScope Domain -DynamicUpdate Secure
# Ejemplo de salida DNS externa; adaptar a la política de la red
Set-DnsServerForwarder -IPAddress 1.1.1.1,9.9.9.9
Add-DnsServerResourceRecordA -ZoneName ad.lab.test -Name app01 `
  -IPv4Address 10.10.10.30 -CreatePtr
Add-DnsServerResourceRecordA -ZoneName ad.lab.test -Name linux01 `
  -IPv4Address 10.10.10.102 -CreatePtr
Rename-ADObject -Identity (Get-ADReplicationSite 'Default-First-Site-Name') `
  -NewName LAB-SITE
New-ADReplicationSubnet -Name '10.10.10.0/24' -Site LAB-SITE
Resolve-DnsName dc01.ad.lab.test -Server 10.10.10.10
Resolve-DnsName _ldap._tcp.dc._msdcs.ad.lab.test -Type SRV
Resolve-DnsName _kerberos._tcp.ad.lab.test -Type SRV
Resolve-DnsName 10.10.10.10 -Type PTR
```
La zona inversa ayuda al diagnóstico, pero un PTR no sustituye al FQDN del certificado ni a los registros SRV. Los miembros Windows registran sus A dinámicamente. Si un objeto DNS ya existe, revisar y actualizarlo, no ejecutar Add-* de nuevo.

El PDC Emulator del dominio raíz se configura con fuentes horarias externas fiables; los demás miembros siguen la jerarquía de dominio. Con salida a Internet autorizada, ejemplo en DC01:
```powershell
w32tm /config /manualpeerlist:"0.pool.ntp.org,0x8 1.pool.ntp.org,0x8" `
  /syncfromflags:manual /reliable:yes /update
Restart-Service W32Time
w32tm /resync
w32tm /query /source
w32tm /query /status
# En miembros y DC02, usar la jerarquia de dominio
w32tm /config /syncfromflags:domhier /update
```
La última instrucción se ejecuta en los miembros/DC02, no en el PDC configurado. En entorno sin Internet usar una fuente NTP local verificable. Evitar que la sincronización periódica del hipervisor compita con la fuente del DC; revisar su configuración de forma específica. El desfase Kerberos típico permitido es de cinco minutos, pero el objetivo operativo es segundos.

Puerta de avance: A y SRV correctos, hora sincronizada y resolución externa solo si NAT está habilitado. Documentar excepciones en lugar de dar por válidos fallos de DNS.

<a id="fase-05"></a>

## 06 · Fase 3: OU, usuarios, grupos y AGDLP

Separar Usuarios, Equipos, Servidores, Grupos y CuentasServicio. Mantener los DC en la OU Domain Controllers, con políticas propias. Las OU sirven para delegar y enlazar GPO; los grupos para autorizar. No desplazar un DC a Servidores por estética.
```powershell
Import-Module ActiveDirectory
$base = 'DC=ad,DC=lab,DC=test'
foreach ($ou in 'Usuarios','Equipos','Servidores','Grupos','CuentasServicio') {
  New-ADOrganizationalUnit -Name $ou -Path $base `
    -ProtectedFromAccidentalDeletion $true
}
foreach ($ou in 'IT','Ventas','Administracion','Direccion') {
  New-ADOrganizationalUnit -Name $ou -Path "OU=Usuarios,$base"
}
foreach ($ou in 'Portatiles','Sobremesa','Linux') {
  New-ADOrganizationalUnit -Name $ou -Path "OU=Equipos,$base"
}
$people = @(
  @{Sam='jperez';Name='Juan Perez';Dept='Ventas'},
  @{Sam='mgarcia';Name='Maria Garcia';Dept='Ventas'},
  @{Sam='alopez';Name='Ana Lopez';Dept='IT'},
  @{Sam='crodriguez';Name='Carlos Rodriguez';Dept='Administracion'}
)
foreach ($p in $people) {
  $pw = Read-Host "Clave inicial para $($p.Sam)" -AsSecureString
  New-ADUser -Name $p.Name -SamAccountName $p.Sam `
    -UserPrincipalName "$($p.Sam)@ad.lab.test" `
    -Path "OU=$($p.Dept),OU=Usuarios,$base" `
    -AccountPassword $pw -Enabled $true -ChangePasswordAtLogon $true
}
foreach ($g in 'Ventas','IT','Administracion','Direccion') {
  New-ADGroup -Name "GG_$g" -GroupScope Global -GroupCategory Security `
    -Path "OU=Grupos,$base"
}
Add-ADGroupMember GG_Ventas jperez,mgarcia
Add-ADGroupMember GG_IT alopez
Add-ADGroupMember GG_Administracion crodriguez
foreach ($g in 'DL_FS_Ventas_RW','DL_FS_Ventas_RO') {
  New-ADGroup -Name $g -GroupScope DomainLocal -GroupCategory Security `
    -Path "OU=Grupos,$base"
}
Add-ADGroupMember DL_FS_Ventas_RW GG_Ventas
Get-ADGroupMember DL_FS_Ventas_RW -Recursive
```
AGDLP: Accounts -> Global groups -> Domain Local groups -> Permissions. jperez pertenece a GG_Ventas; ese grupo pertenece a DL_FS_Ventas_RW; este último obtiene permisos sobre FS01. DL_FS_Ventas_RO se deja inicialmente sin miembros para una prueba posterior de solo lectura. No asignar ACL individuales salvo una excepción documentada.

Utilizar una cuenta administrativa separada de las cuentas de usuario. El uso de Administrator en los ejemplos es para el bootstrap aislado: delegar después la unión de equipos a las OU necesarias y limitar administradores del dominio.

Puerta de avance: objetos en las OU previstas y grupos con ámbito correcto. Las nuevas pertenencias necesitan una nueva sesión/ticket para reflejarse en el token de acceso.

<a id="fase-06"></a>

## 07 · Fase 4: Windows 11 y Kerberos

En CLIENT01 configurar IP .101/24 y DNS .10; añadir .11 tras validar DC02. El gateway es .1. Utilizar los mismos cmdlets de red de DC01 con la IP de CLIENT01. Después:
```powershell
Rename-Computer -NewName CLIENT01 -Restart
# Tras reinicio, como administrador local
Resolve-DnsName _ldap._tcp.dc._msdcs.ad.lab.test -Type SRV
Test-NetConnection dc01.ad.lab.test -Port 445
Add-Computer -DomainName ad.lab.test `
  -OUPath 'OU=Sobremesa,OU=Equipos,DC=ad,DC=lab,DC=test' `
  -Credential (Get-Credential 'LAB\Administrator') -Restart
```
Iniciar sesión con jperez@ad.lab.test, completar el cambio inicial de contraseña y verificar como ese usuario:
```powershell
whoami /upn
whoami /groups
$env:LOGONSERVER
nltest /dsgetdc:ad.lab.test /force
klist
w32tm /query /status
# En PowerShell elevado del equipo
Test-ComputerSecureChannel -Verbose
```
Solicitar un servicio por FQDN, por ejemplo `\\fs01.ad.lab.test\Ventas` cuando FS01 esté listo. klist debe mostrar el TGT krbtgt y un ticket cifs/fs01.ad.lab.test. Acceder por IP puede impedir Kerberos y provocar NTLM; no es una prueba equivalente.

Un TGT presente y un inicio de sesión correcto son evidencias útiles, pero no prueban que cada aplicación utilice Kerberos. LOGONSERVER muestra el servidor de la sesión y puede seguir apuntando al DC previo. El inicio de sesión offline en caché no demuestra disponibilidad del dominio.

Si se rompe el canal seguro en un miembro, investigar DNS/hora y la contraseña de máquina antes de volver a unirlo. Test-ComputerSecureChannel no se emplea como diagnóstico de DC. No compartir snapshots antiguos de un miembro como sustituto de una recuperación planificada.

<a id="fase-07"></a>

## 08 · Fase 5: GPO, contraseñas y validación

Crear políticas pequeñas con nombres claros. La precedencia habitual es local, sitio, dominio, OU, con herencia y posibles excepciones. Configuración de equipo se evalúa para la OU del equipo; configuración de usuario para la OU del usuario. Loopback es una decisión explícita para puestos especiales, no un remedio automático.
```powershell
Import-Module GroupPolicy
$base = 'DC=ad,DC=lab,DC=test'
New-GPO -Name GPO_Clients_Baseline
New-GPLink -Name GPO_Clients_Baseline -Target "OU=Equipos,$base"
# Ajuste de equipo observable: exigir Ctrl+Alt+Supr
Set-GPRegistryValue -Name GPO_Clients_Baseline `
  -Key 'HKLM\Software\Microsoft\Windows\CurrentVersion\Policies\System' `
  -ValueName DisableCAD -Type DWord -Value 0
New-GPO -Name GPO_Users_Baseline
New-GPLink -Name GPO_Users_Baseline -Target "OU=Usuarios,$base"
# Ajuste de usuario demostrable: impedir Panel de control
Set-GPRegistryValue -Name GPO_Users_Baseline `
  -Key 'HKCU\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer' `
  -ValueName NoControlPanel -Type DWord -Value 1
```
Usar GPMC para revisar los ajustes y su compatibilidad con las plantillas ADMX instaladas. Aplicar gradualmente en una OU piloto, conservar firewall y Defender activos, y registrar cambios. Las GPO de DC requieren un enlace a Domain Controllers y una revisión más estricta.

La política de contraseña del dominio no se aplica por enlazar una GPO a la OU de usuarios. Configurar la política efectiva del dominio y comprobarla; las Fine-Grained Password Policies se asignan a usuarios o grupos globales, no a OU.
```powershell
# Ejemplo didactico; ajustar a requisitos reales de la organizacion
Set-ADDefaultDomainPasswordPolicy -Identity ad.lab.test `
  -MinPasswordLength 14 -PasswordHistoryCount 24 `
  -ComplexityEnabled $true -ReversibleEncryptionEnabled $false `
  -MinPasswordAge (New-TimeSpan -Days 1) `
  -MaxPasswordAge (New-TimeSpan -Days 90) `
  -LockoutThreshold 10 -LockoutDuration (New-TimeSpan -Minutes 15) `
  -LockoutObservationWindow (New-TimeSpan -Minutes 15)
Get-ADDefaultDomainPasswordPolicy
Get-ADUserResultantPasswordPolicy jperez
```
La expiración de 90 días es un parámetro de ejemplo, no una recomendación universal. Si se gestiona la política por GPO a nivel de dominio, mantenerla coherente: una edición directa puede ser reemplazada por la política aplicada. No mezclar fuentes contradictorias.
```powershell
# En CLIENT01, bajo el usuario que se prueba
gpupdate /force
gpresult /r
gpresult /h "$env:TEMP\gpresult.html"
```
Cerrar y abrir sesión si se solicita. Comprobar el valor HKCU como jperez, y el valor HKLM como administrador del equipo. Puerta de avance: ambos ajustes y el informe confirman las GPO correctas, sin atribuir a una GPO ajustes procedentes de otra.

<a id="fase-08"></a>

## 09 · Fase 6: FS01, permisos SMB/NTFS y unidad V

Configurar FS01 .20, DNS .10 y posteriormente .11; renombrar y unir con Add-Computer a OU=Servidores. Añadir un disco de datos, inicializarlo desde Disk Management tras verificar su identidad y montarlo como D:. No formatear discos mediante un índice copiado del guion.

En FS01 elevado, el siguiente ejemplo crea una carpeta nueva con ACL controlada. Usar nombres de grupos de dominio y SIDs para las identidades locales integradas, evitando traducciones de Administrators/Administradores.
```powershell
Install-WindowsFeature FS-FileServer
$path = 'D:\Shares\Ventas'
New-Item -ItemType Directory -Path $path -Force
$acl = Get-Acl $path
$acl.SetAccessRuleProtection($true,$false)
foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRuleSpecific($rule) }
$inherit = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit'
$prop = [System.Security.AccessControl.PropagationFlags]::None
$allow = [System.Security.AccessControl.AccessControlType]::Allow
foreach ($entry in @(
  @('S-1-5-18','FullControl'),
  @('S-1-5-32-544','FullControl'),
  @('LAB\DL_FS_Ventas_RW','Modify'),
  @('LAB\DL_FS_Ventas_RO','ReadAndExecute')
)) {
  $id = if ($entry[0] -like 'S-1-*') {
    [System.Security.Principal.SecurityIdentifier]::new($entry[0])
  } else { [System.Security.Principal.NTAccount]::new($entry[0]) }
  $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
    $id,[System.Security.AccessControl.FileSystemRights]$entry[1],
    $inherit,$prop,$allow)
  $acl.AddAccessRule($rule)
}
Set-Acl -Path $path -AclObject $acl
$admins = ([System.Security.Principal.SecurityIdentifier]'S-1-5-32-544').Translate(
  [System.Security.Principal.NTAccount]).Value
New-SmbShare -Name Ventas -Path $path -FullAccess $admins `
  -ChangeAccess 'LAB\DL_FS_Ventas_RW' -ReadAccess 'LAB\DL_FS_Ventas_RO' `
  -FolderEnumerationMode AccessBased -EncryptData $true
Get-SmbShareAccess Ventas
(Get-Acl $path).Access | Format-Table IdentityReference,FileSystemRights
```
Estos comandos reemplazan la ACL de esa carpeta; ejecutarlos solo sobre la carpeta de laboratorio nueva. Los permisos efectivos por red son la combinación restrictiva de SMB y NTFS. Access-Based Enumeration oculta elementos sin acceso, pero no concede ni revoca permisos. La cuota y la auditoría son decisiones adicionales.

En GPMC crear GPO_MapDrive_Ventas, enlazada a OU=Usuarios. User Configuration > Preferences > Windows Settings > Drive Maps: acción Update, letra V:, ubicación `\\fs01.ad.lab.test\Ventas`. En Common activar Item-level targeting > Security Group > GG_Ventas y Remove this item when it is no longer applied. No almacenar credenciales alternativas en preferencias.

Mantener Authenticated Users con lectura/aplicación de esta GPO y filtrar el elemento por grupo. Si se restringe el security filtering, conservar lectura para las cuentas de equipo necesarias (por ejemplo Domain Computers) además de los permisos del usuario; el procesamiento de políticas de usuario necesita leer la GPO.

Pruebas: jperez crea, modifica y borra un fichero; alopez obtiene acceso denegado. Para RO, añadir temporalmente GG_Administracion a DL_FS_Ventas_RO: crodriguez puede leer un fichero de prueba pero no escribir. Renovar sesión tras cambios de grupo, registrar resultado y retirar la pertenencia temporal si no se desea conservar.

<a id="fase-09"></a>

## 10 · Fase 7: DC02, replicación y DNS redundante

Configurar DC02 .11/24, gateway .1 y DNS únicamente .10 durante la promoción. Renombrar, unir al dominio y reiniciar. Instalar AD DS y promocionar en el dominio existente:
```powershell
Add-Computer -DomainName ad.lab.test `
  -Credential (Get-Credential 'LAB\Administrator') -Restart
# Tras reinicio
Install-WindowsFeature AD-Domain-Services -IncludeManagementTools
$dsrm = Read-Host 'Clave DSRM de DC02' -AsSecureString
Install-ADDSDomainController -DomainName ad.lab.test -InstallDns `
  -SiteName LAB-SITE -Credential (Get-Credential 'LAB\Administrator') `
  -SafeModeAdministratorPassword $dsrm
# Tras reinicio y convergencia
repadmin /replsummary
repadmin /showrepl
dcdiag /e /test:dns /v
Get-ADDomainController -Filter * | Select-Object HostName,Site,IsGlobalCatalog
Get-SmbShare -Name SYSVOL,NETLOGON
```
No introducir su propio DNS como única fuente hasta que la replicación entrante y saliente esté verificada. Después, en DC01 usar .11 preferido y .10 alternativo; en DC02 .10 preferido y .11 alternativo. Este patrón sirve para este sitio de dos DC; no es la única configuración válida.
```powershell
# Ejecutar en DC01
Set-DnsClientServerAddress -InterfaceAlias Ethernet `
  -ServerAddresses 10.10.10.11,10.10.10.10
# Ejecutar en DC02
Set-DnsClientServerAddress -InterfaceAlias Ethernet `
  -ServerAddresses 10.10.10.10,10.10.10.11
# Ejecutar en miembros Windows
Set-DnsClientServerAddress -InterfaceAlias Ethernet `
  -ServerAddresses 10.10.10.10,10.10.10.11
```
Los reenviadores DNS son configuración del servidor: comprobarlos en ambos DC, no asumir que se replican como las zonas AD integradas. Confirmar la zona inversa y SRV desde cada DNS. SYSVOL replica por DFSR y el directorio por replicación AD: son mecanismos distintos.
```powershell
# En un DC con RSAT, creacion dirigida expresamente a DC01
New-ADUser -Name testreplica -SamAccountName testreplica `
  -Path 'OU=IT,OU=Usuarios,DC=ad,DC=lab,DC=test' `
  -Server dc01.ad.lab.test
# Repetir hasta convergencia; no exigir resultado instantaneo
Get-ADUser testreplica -Server dc02.ad.lab.test
Set-ADUser testreplica -Description 'Cambio desde DC02' -Server dc02.ad.lab.test
Get-ADUser testreplica -Properties Description -Server dc01.ad.lab.test
```
El usuario de prueba queda deshabilitado. Registrar tiempo de convergencia; no afirmar replicación usando Get-ADUser sin -Server, pues podría consultar el mismo DC. No forzar /syncall repetidamente para ocultar una causa de DNS, RPC o permisos. Puerta de avance: cero fallos persistentes, SYSVOL sano y cambios en ambos sentidos.

<a id="fase-10"></a>

## 11 · Fase 8: CA01 y emisión de certificados

Crear CA01 .40/24, DNS .10/.11; renombrar y unir a OU=Servidores. Instalar el rol AD CS. La Enterprise Root exige privilegios suficientes para publicar la CA y sus plantillas en AD; usar temporalmente una cuenta de bootstrap autorizada (Enterprise Admins/Domain Admins según operación) y retirarlos después.
```powershell
Install-WindowsFeature ADCS-Cert-Authority -IncludeManagementTools
Install-AdcsCertificationAuthority -CAType EnterpriseRootCA `
  -CACommonName 'LAB-Root-CA' `
  -CryptoProviderName 'RSA#Microsoft Software Key Storage Provider' `
  -KeyLength 4096 -HashAlgorithmName SHA256 `
  -ValidityPeriod Years -ValidityPeriodUnits 10
```
Planificar nombre, rutas y backup antes de instalar: no renombrar la CA después de emitir certificados. Una CA Enterprise online en un nivel es una simplificación consciente de laboratorio. No añadir Web Enrollment ni exponer inscripción por HTTP solo para obtener LDAPS.

En certtmpl.msc duplicar la plantilla Kerberos Authentication con nombre mostrado LAB DC TLS y nombre interno LABDCTLS. Mantener los usos necesarios para autenticación del DC, incluido Server Authentication (OID 1.3.6.1.5.5.7.3.1). Configurar Subject Name para construir desde Active Directory e incluir DNS name; no permitir Supply in the request a usuarios generales. Clave RSA mínimo 2048, SHA256, clave privada no exportable, vigencia de un año y renovación con antelación.

En Security conceder Read, Enroll y Autoenroll al grupo Domain Controllers. No conceder inscripción general a Domain Users ni permitir solicitudes arbitrarias con EKU de autenticación. En certsrv.msc: Certificate Templates > New > Certificate Template to Issue > LAB DC TLS. Comprobar las opciones disponibles según compatibilidad de la plantilla y cliente.

Crear GPO_DC_AutoEnroll enlazada a OU=Domain Controllers. Computer Configuration > Policies > Windows Settings > Security Settings > Public Key Policies > Certificate Services Client - Auto-Enrollment: Enabled, renovar certificados y actualizar los basados en plantillas. Los DC deben poder leer la GPO, contactar con la CA e inscribirse.
```powershell
# En cada DC, elevado
gpupdate /force
certutil -pulse
Get-ChildItem Cert:\LocalMachine\My | Select-Object Subject,DnsNameList,
  HasPrivateKey,NotAfter,EnhancedKeyUsageList
# Alternativa de inscripcion explicita, tras publicar y autorizar plantilla
Get-Certificate -Template LABDCTLS -CertStoreLocation Cert:\LocalMachine\My
```
No pedir un segundo certificado si autoenrollment ya ha emitido uno válido. Revisar en certlm.msc: clave privada, SAN dc01.ad.lab.test o dc02.ad.lab.test, EKU y cadena. AD puede seleccionar un certificado no previsto si existen varios elegibles; controlar los almacenes y, si es necesario, el almacén Personal del servicio NTDS.

Para el laboratorio, reiniciar cada DC por separado en una ventana controlada después de emitir/renovar si LDAPS no ha recargado el certificado. Nunca reiniciar ambos a la vez. Verificar por TLS el certificado servido, no solo el presente en disco.

Publicar puntos CDP/AIA y CRL alcanzables por los consumidores antes de depender de certificados. Los defaults LDAP pueden servir a miembros AD, pero no bastan para aplicaciones no unidas. Diseñar una URL HTTP interna persistente, configurar extensiones CDP/AIA en propiedades de la CA, emitir nueva CRL y revisar un certificado recién emitido; los ya emitidos conservan sus URLs. certutil -url sobre el certificado y Enterprise PKI (pkiview.msc) permiten comprobar cadena/revocación. No incluir la clave privada de la CA en entregables ni repositorios.

<a id="fase-11"></a>

## 12 · Fase 9: Linux, confianza TLS y LDAP

En LINUX01 configurar hostname y red. Ejemplo netplan para Ubuntu Server, sustituyendo ens18 por la interfaz real. Revisar netplan existente para evitar configuraciones duplicadas y aplicar desde consola con netplan try.
```yaml
network:
  version: 2
  ethernets:
    ens18:
      dhcp4: false
      addresses: [10.10.10.102/24]
      routes:
        - to: default
          via: 10.10.10.1
      nameservers:
        addresses: [10.10.10.10, 10.10.10.11]
        search: [ad.lab.test]
```
```bash
sudo hostnamectl set-hostname linux01.ad.lab.test
sudo netplan try
sudo apt update
sudo apt install ldap-utils openssl ca-certificates dnsutils
dig +short SRV _ldap._tcp.dc._msdcs.ad.lab.test
timedatectl status
```
Exportar el certificado público de LAB-Root-CA desde CA01, sin clave privada. Transportarlo por un canal fiable y verificar su huella SHA256 mediante un canal independiente antes de confiar en él. Si se exportó en DER, convertir a PEM:
```bash
openssl x509 -inform DER -in LAB-Root-CA.cer -out LAB-Root-CA.crt
openssl x509 -in LAB-Root-CA.crt -noout -fingerprint -sha256
sudo install -m 0644 LAB-Root-CA.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates
```
La extensión .crt no determina el formato: para update-ca-certificates debe contener PEM. Instalar la confianza también en APP01 y en cualquier almacén propio del runtime/aplicación. Validar ambos DC:
```bash
openssl s_client -connect dc01.ad.lab.test:636 \
  -servername dc01.ad.lab.test -verify_hostname dc01.ad.lab.test \
  -verify_return_error -CAfile /etc/ssl/certs/ca-certificates.crt </dev/null
openssl s_client -connect dc02.ad.lab.test:636 \
  -servername dc02.ad.lab.test -verify_hostname dc02.ad.lab.test \
  -verify_return_error -CAfile /etc/ssl/certs/ca-certificates.crt </dev/null
LDAPTLS_CACERT=/etc/ssl/certs/ca-certificates.crt \
ldapsearch -LLL -x -H ldaps://dc01.ad.lab.test:636 \
  -D 'jperez@ad.lab.test' -W -b 'DC=ad,DC=lab,DC=test' \
  '(sAMAccountName=jperez)' dn cn userPrincipalName memberOf
# Alternativa STARTTLS obligatorio: -ZZ aborta si no hay TLS
ldapsearch -LLL -x -ZZ -H ldap://dc02.ad.lab.test:389 \
  -D 'jperez@ad.lab.test' -W -b 'DC=ad,DC=lab,DC=test' \
  '(sAMAccountName=jperez)' dn
```
No usar LDAPTLS_REQCERT=never ni un simple bind con contraseña por LDAP plano. Un openssl s_client sin -verify_hostname ni -verify_return_error no es una validación suficiente. LDAP signing y channel binding son controles diferentes del cifrado TLS: inventariar los clientes y verificar compatibilidad antes de reforzarlos. Windows Server 2025 incorpora cambios de seguridad según despliegue y política efectiva; no asumir que un bind inseguro funciona ni rebajar políticas para conservarlo.

memberOf no muestra automáticamente todos los grupos transitivos ni el grupo primario. Si se autoriza por grupos anidados, usar una consulta compatible con AD o calcular pertenencias de manera explícita. La contraseña inicial debe haberse cambiado antes de las pruebas LDAP interactivas.

<a id="fase-12"></a>

## 13 · Fase 10: unión de Linux con realmd/SSSD

Consultar LDAP no une Linux al dominio. Para autenticar usuarios del dominio en LINUX01 utilizar realmd/adcli/SSSD con DNS y reloj correctos. La siguiente receta está dirigida a Ubuntu Server 24.04 LTS; Fedora/RHEL usan paquetes y herramientas diferentes.
```bash
sudo apt install realmd sssd-ad sssd-tools adcli \
  libnss-sss libpam-sss samba-common-bin krb5-user
realm discover ad.lab.test
sudo realm join --user=Administrator \
  --computer-ou='OU=Linux,OU=Equipos,DC=ad,DC=lab,DC=test' ad.lab.test
realm list
sudo pam-auth-update --enable mkhomedir
sudo realm deny --all
sudo realm permit -g 'GG_IT@ad.lab.test'
id 'alopez@ad.lab.test'
getent passwd 'alopez@ad.lab.test'
kinit alopez@AD.LAB.TEST
klist
sudo sssctl config-check
sudo sssctl domain-status ad.lab.test
```
Cambiar previamente la contraseña inicial de alopez usando un cliente compatible. Comprobar que los nombres de grupo resuelven con getent group y utilizar su forma exacta en realm permit. La cuenta de unión debe ser delegada en una operación repetible; Administrator se usa solo para el arranque del lab.

Revisar /etc/sssd/sssd.conf (root:root, modo 0600), use_fully_qualified_names y access_provider; no sustituir a ciegas el archivo generado. La evaluación de GPO por SSSD puede afectar el login Linux: revisar las reglas y logs antes de relajar el control. Los ajustes de escritorio Windows no se convierten en políticas Linux; ADSys ofrece otra integración y no se despliega aquí.

Probar una sesión local/SSH de alopez y negar jperez, sin abrir SSH a Internet ni habilitar root por contraseña. id demuestra resolución de identidad, no autorización de login. Comprobar una sesión real y los logs PAM/SSSD. Evitar otorgar sudo a todos los usuarios del dominio.

Puerta de avance: ticket Kerberos, identidad resuelta, home creado y acceso restringido al grupo previsto. Registrar si SSSD cachea credenciales: una prueba offline de Linux tampoco demuestra contacto con un DC activo.

<a id="fase-13"></a>

## 14 · Fase 11: APP01 e integración de aplicación

Configurar APP01 .30/24, DNS .10/.11 y el registro app01 ya creado. No necesita unión al dominio para autenticación mediante LDAP sobre TLS. Instalar Python, venv y la cadena de confianza igual que en LINUX01. El entregable incluye una demo de consola reproducible en examples/app01_ldap.py: no es un portal web ni un servicio de producción.

Crear una cuenta de búsqueda sin privilegios administrativos y un grupo de acceso de aplicación. No añadir la cuenta de servicio a Domain Admins ni al grupo autorizado a la aplicación.
```powershell
$pw = Read-Host 'Clave de svc_ldap_app' -AsSecureString
New-ADUser -Name svc_ldap_app -SamAccountName svc_ldap_app `
  -UserPrincipalName svc_ldap_app@ad.lab.test `
  -Path 'OU=CuentasServicio,DC=ad,DC=lab,DC=test' `
  -AccountPassword $pw -Enabled $true -ChangePasswordAtLogon $false
New-ADGroup -Name GG_APP_Usuarios -GroupScope Global -GroupCategory Security `
  -Path 'OU=Grupos,DC=ad,DC=lab,DC=test'
Add-ADGroupMember GG_APP_Usuarios GG_Ventas
```
La lectura por defecto de AD puede ser suficiente para esta búsqueda de laboratorio. Evaluar y delegar solo atributos/OU necesarios si la organización ha restringido el directorio. Denegar logon interactivo/RDP a la cuenta de servicio en los servidores donde corresponda. Rotar su clave y no desactivar expiración como atajo; considerar gMSA/Kerberos para aplicaciones que los soporten.

Parámetros: endpoints ldaps://dc01.ad.lab.test:636 y ldaps://dc02.ad.lab.test:636; base de usuarios OU=Usuarios,DC=ad,DC=lab,DC=test; filtro exacto sAMAccountName escapado; grupo autorizado CN=GG_APP_Usuarios,OU=Grupos,DC=ad,DC=lab,DC=test. Nunca permitir un filtro LDAP construido con entrada sin escape.

Flujo: validar entrada y rechazar contraseña vacía; bind de búsqueda con svc_ldap_app; buscar un único usuario; bind separado con su DN y contraseña sobre TLS; verificar autorización al grupo; cerrar conexiones. Un bind exitoso verifica credenciales, no autoriza automáticamente a usar la aplicación. Para grupos anidados se utiliza la regla AD 1.2.840.113556.1.4.1941 sobre memberOf.
```bash
sudo apt install python3-venv
python3 -m venv .venv
. .venv/bin/activate
pip install -r examples/requirements.txt
python examples/app01_ldap.py
```
La demo pide claves por getpass y no las escribe a disco. El failover ocurre ante fallos de transporte/TLS, no ante contraseña inválida: así se evitan intentos repetidos que bloqueen cuentas. En un servicio real usar gestor de secretos, límites de intentos, HTTPS frontal, sesiones seguras, protección CSRF y mensajes genéricos. Nunca registrar contraseñas, filtros con datos sensibles ni resultados de directorio completos.

Pruebas: jperez con clave correcta entra; clave incorrecta falla sin reintento en otro DC; alopez con clave correcta queda sin autorización; cadena no confiable y nombre TLS erróneo fallan; con DC01 detenido, un usuario válido entra por DC02. Revisar revocación en el runtime elegido: el ejemplo valida cadena/nombre, pero no implementa descarga/validación de CRL u OCSP.

<a id="fase-14"></a>

## 15 · Puertos y flujos de comunicación

| Destino | Puerto / protocolo | Función y origen |
| --- | --- | --- |
| DC01/DC02 | 53 TCP y UDP | DNS desde miembros y DC; TCP para respuestas grandes/otras operaciones |
| DC01/DC02 | 88 TCP y UDP | Kerberos desde miembros |
| DC01/DC02 | 389 TCP | LDAP y STARTTLS; replicación/consultas según cliente |
| DC01/DC02 | 389 UDP | CLDAP para descubrimiento, no bind LDAP de contraseña |
| DC01/DC02 y FS01 | 445 TCP | SYSVOL/NETLOGON y recursos SMB |
| DC01/DC02 | 464 TCP y UDP | Cambio de contraseña Kerberos |
| DC01/DC02 | 636 TCP | LDAPS desde APP01 y clientes de consulta |
| DC01/DC02 | 3268 / 3269 TCP | Global Catalog / GC sobre TLS cuando se necesite |
| DC/CA según operación | 135 TCP | RPC Endpoint Mapper |
| DC/CA según operación | 49152-65535 TCP | RPC dinámico moderno, limitado a orígenes autorizados |
| DC/PDC/fuente horaria | 123 UDP | Sincronización de hora |
| DC01/DC02 | 9389 TCP | AD Web Services para administración RSAT |
| CA/repositorio interno | 80/443 TCP | AIA/CDP o aplicación HTTPS si se configura |
| Administración | 3389 / 5985 / 5986 TCP | RDP/WinRM solo si se habilitan y desde origen de gestión |

No abrir todos los puertos a todos los equipos. APP01 requiere DNS y LDAPS; la inscripción de certificados por los DC puede requerir RPC hacia CA01; los miembros y los DC tienen necesidades más amplias de dominio. Las reglas de los roles Windows constituyen el punto de partida en el mismo segmento, pero hay que revisar perfiles y reglas tras instalar.

LDAPS no reemplaza DNS, Kerberos, SMB o RPC. La replicación AD requiere más que 389. En Server 2025 SYSVOL usa DFSR; no añadir puertos heredados sin necesidad comprobada. NTP requiere UDP y Test-NetConnection -Port solo prueba TCP. Utilizar logs/trazas o herramienta específica para diagnosticar UDP.

La tabla es un mapa de los flujos del lab, no una plantilla universal de firewall. Los servicios y roles adicionales pueden introducir otros puertos. Confirmar el rango RPC configurado en cada sistema y la dirección de cada flujo en redes segmentadas.

<a id="fase-15"></a>

## 16 · Tolerancia a fallos y pruebas controladas

Antes de apagar un DC, verificar replicación sana, ambos DNS en los clientes y certificados válidos en ambos endpoints. Crear una cuenta de prueba nueva sin sesión previa y con contraseña conocida de laboratorio; verificar por -Server que ya existe en DC02. Conservar acceso local de administrador y consola.

Apagar DC01 de forma ordenada desde el hipervisor; mantener DC02, FS01, CA01 y el cliente. No desconectar simultáneamente las dos interfaces o ambos DC. Ejecutar:
```powershell
Resolve-DnsName dc02.ad.lab.test -Server 10.10.10.11
nltest /dsgetdc:ad.lab.test /force
# Bajo la sesion de prueba; purge elimina tickets de esa sesion
klist purge
klist get cifs/fs01.ad.lab.test
klist
Get-ADUser testreplica -Server dc02.ad.lab.test
```
Iniciar sesión con la cuenta nueva, obtener tickets y probar SMB. Un login con una cuenta usada previamente podría ser caché. Una sesión SMB existente también puede seguir abierta sin nueva autenticación; cerrar conexiones en el equipo de prueba antes de evaluar una nueva. No eliminar sesiones de otros usuarios.

Desde Linux consultar dc02 por LDAPS y desde APP01 probar failover de la demo. Confirmar que una contraseña inválida no dispara prueba del otro endpoint. Medir el retraso de selección DNS/DC: la conmutación no tiene por qué ser instantánea.

Restaurar DC01 y verificar repadmin /replsummary, /showrepl y dcdiag. Revisar eventos de DFSR, DNS, Directory Service y hora. No hacer seize de FSMO para una parada temporal. Transferir roles solo en mantenimiento planificado; seize es una recuperación por pérdida definitiva y requiere procedimiento específico.

Repetir con DC02 detenido cuando DC01 haya convergido. La caída de CA01 puede impedir nueva emisión/renovación, aunque los certificados emitidos sigan siendo válidos; la disponibilidad de CRL/AIA y su vigencia es crítica. FS01 y APP01 son puntos únicos de fallo en esta arquitectura. Documentar qué continuidad se demuestra y cuál queda fuera de alcance.

<a id="fase-16"></a>

## 17 · Troubleshooting por síntoma

| Síntoma | Causas probables | Comprobación y respuesta |
| --- | --- | --- |
| No se encuentra el dominio | DNS público, SRV ausente, IP duplicada | ipconfig /all; Resolve-DnsName SRV; corregir DNS antes de la unión |
| GPO no aparece | OU incorrecta, alcance usuario/equipo, lectura denegada | gpresult /h; enlaces en GPMC; permisos y filtrado |
| Kerberos falla | Reloj, DNS, SPN incorrecto, acceso por IP | w32tm; klist; setspn -Q cifs/fs01.ad.lab.test |
| Acceso SMB denegado | Token viejo, membresía, ACL NTFS/SMB | Nueva sesión; whoami /groups; Get-SmbShareAccess; ACL efectiva |
| Replicación 1722 | RPC inaccesible, DNS o firewall | repadmin /showrepl; logs; probar 135 y rango RPC autorizado |
| SYSVOL no disponible | DFSR inicial pendiente/error | Eventos DFS Replication; no forzar restauración autoritativa sin diagnóstico |
| LDAPS no escucha | Certificado no elegible o no cargado | certlm.msc; clave privada/SAN/EKU; certificado servido; reinicio controlado |
| TLS untrusted/name mismatch | CA ausente, SAN incorrecto, endpoint por IP | Verificar cadena, SAN y confianza del runtime; nunca desactivar validación |
| LDAP invalidCredentials | Usuario/clave, estado o formato de bind | Comprobar cuenta y log; no repetir en bucle para evitar bloqueo |
| Strong authentication required | Bind inseguro o políticas de firma | TLS o SASL protegido; no rebajar la política |
| Linux resuelve pero no inicia sesión | PAM, restricciones realm/GPO, SSSD | sssctl; journalctl -u sssd; logs de autenticación |
| DC caído y login funciona | Credenciales/tickets en caché | Cuenta nueva y TGT/servicio nuevo contra DC disponible |

Ruta de diagnóstico: red/IP -> DNS -> hora -> descubrimiento DC -> protocolo concreto -> identidad/permisos -> aplicación. Registrar hora, host, comando y resultado antes de modificar. Cambiar una variable a la vez.
```powershell
Get-WinEvent -LogName 'Directory Service' -MaxEvents 30
Get-WinEvent -LogName 'DFS Replication' -MaxEvents 30
Get-WinEvent -LogName System -MaxEvents 30
setspn -Q cifs/fs01.ad.lab.test
```
```bash
resolvectl status
journalctl -u sssd --since '30 minutes ago'
sudo sssctl user-checks 'alopez@ad.lab.test'
openssl x509 -in LAB-Root-CA.crt -noout -subject -issuer -dates
```
No publicar volcados de eventos con nombres de usuarios, topología real o datos sensibles. Los IDs 2886-2889 y los eventos de channel binding ayudan al inventario de LDAP según versión/configuración; revisar su descripción en la build instalada antes de interpretarlos.

<a id="fase-17"></a>

## 18 · Seguridad, operaciones y recuperación

Separar administración del dominio, CA, servidores y puestos. No navegar ni consultar correo desde DC/CA. Usar cuentas dedicadas, mínimo privilegio, bloqueo de sesión y credenciales únicas guardadas en un gestor. Las claves DSRM son distintas de las de usuarios y deben poder recuperarse sin depender del dominio caído.

Mantener parches, Defender y firewall; revisar SMB signing, cifrado, NTLM y políticas LDAP en un despliegue piloto. No desactivar IPv6 de forma indiscriminada para solucionar DNS. No reducir requisitos de firma/channel binding sin entender el cliente y los controles compensatorios. Registrar cambios y pruebas negativas.

Auditar logon, cambios de cuentas/grupos y acceso a recursos según necesidad. Para registrar accesos a ficheros hacen falta política de auditoría y SACL del recurso, no solo el share. Centralizar eventos cuando se amplíe el proyecto. No guardar contraseñas en GPO Preferences ni claves privadas en Git.

Los snapshots no son una estrategia de backup de AD ni de PKI. VM-Generation ID ayuda en hipervisores compatibles, pero no elimina todos los riesgos de restauración y clones. Realizar copias del estado del sistema de DC y copias de datos/ACL de FS01; guardar la base de CA, configuración, certificados y clave privada con protección fuerte. Ensayar restauración en una red aislada.
```powershell
# En un DC; E: debe ser un destino de backup preparado y dedicado
Install-WindowsFeature Windows-Server-Backup
wbadmin start systemstatebackup -backuptarget:E: -quiet
wbadmin get versions -backuptarget:E:
# En CA01: solicita proteccion de clave; custodiar fuera de la VM
certutil -backupDB E:\CA-Backup
certutil -backupKey E:\CA-Backup
reg export HKLM\SYSTEM\CurrentControlSet\Services\CertSvc\Configuration `
  E:\CA-Backup\CA-Configuration.reg
# Backup de GPO (crear carpeta previamente)
Backup-GPO -All -Path E:\GPO-Backup
```
Los ejemplos presuponen un destino E: real y con capacidad; no lo crean ni lo formatean. Guardar backups cifrados fuera del host y probar restauración siguiendo procedimientos de recuperación de bosque/CA, no improvisar sobre las VMs originales. Documentar RPO/RTO: propuesta de lab, copia diaria y ensayo mensual, no garantía de recuperación.

Retirar el lab: exportar evidencias, revocar certificados cuando proceda, despromover DC correctamente, eliminar metadatos solo si la baja normal es imposible, retirar NAT/switch únicamente tras comprobar qué VMs lo utilizan y destruir backups/secretos conforme a la política elegida. Una caída temporal no justifica borrar metadatos.

<a id="fase-18"></a>

## 19 · Matriz de aceptación y evidencias

| ID | Prueba | Criterio de aceptación | Evidencia |
| --- | --- | --- | --- |
| T01 | DNS por ambos DC | A y SRV correctos desde .10 y .11 | Salida Resolve-DnsName con servidor explícito |
| T02 | Salud AD | NTDS/DNS/DFSR activos y SYSVOL/NETLOGON | dcdiag y shares en ambos DC |
| T03 | Unión Windows | Cuenta en OU Sobremesa y canal sano | Get-ADComputer + Test-ComputerSecureChannel |
| T04 | Kerberos | TGT y ticket cifs por FQDN | klist de sesión de usuario |
| T05 | GPO | Ajustes HKLM/HKCU y unidad V aplicados | gpresult y comprobación visible |
| T06 | AGDLP RW | jperez crea/modifica/borra | Fichero de prueba y ACL |
| T07 | AGDLP negativo/RO | alopez denegado, RO no escribe | Resultado con identidades distintas |
| T08 | Replicación | Cambios visibles en DC opuesto; sin fallos persistentes | Consultas -Server y repadmin |
| T09 | Linux dominio | alopez entra; jperez no; TGT disponible | realm/SSSD y sesión real |
| T10 | TLS | Cadena y nombre válidos en ambos DC | s_client estricto y certificado servido |
| T11 | Consulta LDAP | Búsqueda exacta sobre TLS | ldapsearch sin contraseña en salida |
| T12 | Aplicación | Credenciales y grupo verificados, negativos rechazados | Resultado demo sin secretos |
| T13 | Fallo DC01/DC02 | Autenticación online nueva y LDAP por DC activo | Cuenta sin caché, tickets y endpoint |
| T14 | Recuperación | Convergencia tras reinicio | repadmin, eventos y hora |
| T15 | Backup | Copia y restauración aislada demostrables | Registro de backup + ensayo documentado |

Estado inicial de todas las pruebas: pendiente de ejecutar en tu infraestructura. El proyecto documental y la web pueden verificarse sin que exista el lab. No confundir la compilación de la web con la validación del dominio.

Guardar evidencias en docs/evidencias/Txx-fecha-host.txt, con versión de SO/build y resultado esperado/real. Añadir capturas solo cuando aporten información, ocultando datos sensibles. Registrar fallos abiertos, medidas y fecha de repetición. No dar por completada una fase solo porque el comando terminó con exit code cero.

El lab se acepta cuando T01-T14 cumplen y T15 dispone de un ensayo de recuperación documentado. Si se omite backup/restore, indicar aceptación parcial y su riesgo. Definir una ampliación posterior para HA real de FS01/APP01, PKI de dos niveles, segmentación y observabilidad.

<a id="fase-19"></a>

## 20 · Estructura del proyecto y uso de entregables

El README y la web incluyen la misma guía completa. El PDF adapta la composición a impresión. El proyecto React/TypeScript es un sitio documental estático: no expone el laboratorio, no contacta con AD y no contiene credenciales.
```text
ad-lab-web/
  package.json, package-lock.json
  index.html, tsconfig.json, vite.config.ts
  src/App.tsx, src/main.tsx, src/styles.css, src/content.json
  public/README.md
  examples/app01_ldap.py, requirements.txt
  README.md
  dist/                  build estatico verificado
```
Desde la carpeta del proyecto, con Node.js 22.12+ o 24 LTS compatible:
```bash
npm ci
npm run dev
npm run build
npm run preview
```
Publicar dist/ en un alojamiento estático. La configuración base ./ permite rutas de assets relativas; si se introduce React Router o rutas profundas, configurar base y fallback del hosting. Este sitio usa anclas y no requiere backend ni secretos. No incluir node_modules ni archivos .env en Git.

La demo Python es un ejemplo adicional separado del frontend. No poner secretos LDAP en variables VITE_*: se incorporan al JavaScript público. La autenticación real debe ejecutarse en un backend dentro de la red autorizada, con HTTPS y políticas de sesión.

Para GitHub: subir el código, README y evidencias saneadas; ignorar node_modules, dist si el pipeline construye, .env, claves y certificados privados. Elegir una licencia antes de publicación; no se presume una licencia para tus contenidos. GitHub Pages puede construir el sitio mediante un workflow o recibir dist según la estrategia elegida.

<a id="fase-20"></a>

## 21 · Referencias técnicas y control documental

Revisión documental: 7 de octubre de 2026. Versión 2.0. Fuentes oficiales consultadas para corregir requisitos de DNS, TLS, firma/channel binding, puertos e integración Ubuntu. Consultar la documentación de la build instalada antes de cambiar políticas sensibles.

- Microsoft Learn, instalación AD DS: https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/deploy/install-active-directory-domain-services--level-100-
- Microsoft Learn, recomendaciones DNS de DC: https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/best-practices-for-dns-client-settings
- Microsoft Learn, requisitos de certificado LDAPS: https://learn.microsoft.com/en-us/troubleshoot/windows-server/active-directory/enable-ldap-over-ssl-3rd-certification-authority
- Microsoft Learn, LDAP signing: https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/ldap-signing
- Microsoft Learn, LDAP channel binding: https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/ldap-channel-binding
- Microsoft Learn, servicios y puertos: https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/service-overview-and-network-port-requirements
- Microsoft Learn, firewall AD: https://learn.microsoft.com/en-us/troubleshoot/windows-server/active-directory/config-firewall-for-ad-domains-and-trusts
- Ubuntu, SSSD con AD: https://ubuntu.com/server/docs/how-to/sssd/with-active-directory/

El direccionamiento, los recursos, las OU y los umbrales de aceptación son decisiones de este proyecto. Las referencias no implican que cada valor de ejemplo sea un requisito del fabricante. Las recetas deben ejecutarse y validarse en orden; adaptar solo parámetros explícitos (interfaces, fuentes NTP, destinos de backup y políticas) y documentar la adaptación.
