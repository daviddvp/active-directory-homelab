# Laboratorio empresarial AD + LDAP

Laboratorio educativo de identidad y recursos con **Windows Server 2025,
Windows 11 y Ubuntu**. Incluye una guía técnica y una web documental
construida con React, TypeScript y Vite.

## Arquitectura

Dominio: `ad.lab.test` · NetBIOS: `LAB` · Red: `10.10.10.0/24`
Gateway/NAT: `10.10.10.1`.

| Equipo | IP | Función |
| --- | --- | --- |
| DC01 | 10.10.10.10 | AD DS, DNS y Global Catalog |
| DC02 | 10.10.10.11 | AD DS, DNS y replicación |
| FS01 | 10.10.10.20 | Ficheros SMB y permisos NTFS |
| APP01 | 10.10.10.30 | Demo de integración LDAP sobre TLS |
| CA01 | 10.10.10.40 | AD CS y certificados |
| CLIENT01 | 10.10.10.101 | Windows 11 Pro/Enterprise |
| LINUX01 | 10.10.10.102 | Ubuntu, LDAP y SSSD |

## Ejecutar la web

Requiere Node.js 22.12+ o 24 LTS. Desde la raíz del repositorio:

```bash
npm ci
npm run dev
```

```bash
npm run build
npm run preview
```

Para publicar, desplegar el contenido de `dist/` en un alojamiento estático.

## Desplegar el laboratorio

Seguir la [guía técnica](docs/guia-tecnica.md) en orden: red y DC01;
DNS y hora; OU y AGDLP; Windows y GPO; FS01; DC02 y replicación;
CA y LDAPS; Linux y SSSD; integración de aplicación y pruebas de fallo.

- [Manual PDF](docs/Laboratorio-AD-LDAP.pdf).
- `src/`: código y contenido de la web.
- `examples/`: demo Python para APP01 y sus dependencias.
- `docs/evidencias/`: resultados saneados de las pruebas.

## Validación y seguridad

La web está compilada y revisada. Las pruebas de infraestructura deben
ejecutarse en las VMs siguiendo la matriz de aceptación del manual.
La demo LDAP requiere el dominio y sus certificados; no es un backend de
producción. Usar una red aislada, TLS validado y cuentas con mínimo privilegio.
No subir credenciales, claves privadas, discos de VM ni evidencias sensibles.

## Licencia

MIT. Consultar [LICENSE](LICENSE). Las dependencias conservan sus propias
licencias; las licencias de Windows y otros productos son independientes.
