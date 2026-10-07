# 🏢 Active Directory Homelab

Enterprise-style homelab designed to learn and test **Microsoft Active Directory**, identity management and authentication in a realistic Windows/Linux environment.

## 🏗️ Architecture

| Host | IP | Role |
|---|---|---|
| `DC01` | `10.10.10.10` | Active Directory / DNS |
| `DC02` | `10.10.10.11` | Secondary DC / DNS |
| `FS01` | `10.10.10.20` | File Server |
| `APP01` | `10.10.10.30` | LDAP Application |
| `CA01` | `10.10.10.40` | Certificate Authority |
| `CLIENT01` | `10.10.10.101` | Windows 11 Client |
| `LINUX01` | `10.10.10.102` | Linux / LDAP Client |

```text
Domain:   ad.lab.test
NetBIOS:  LAB
Network:  10.10.10.0/24
```

## 🧪 Technologies

- Active Directory Domain Services
- DNS
- Kerberos
- LDAP / LDAPS
- Group Policy
- SMB / NTFS
- AGDLP
- Active Directory Certificate Services
- Windows Server 2025
- Windows 11
- Linux
- PowerShell

## 🚀 Lab Roadmap

- [ ] Deploy `DC01`
- [ ] Configure AD DS and DNS
- [ ] Create OUs, users and groups
- [ ] Join Windows clients to the domain
- [ ] Configure Group Policies
- [ ] Deploy File Server and AGDLP permissions
- [ ] Test LDAP from Linux
- [ ] Deploy `DC02` and configure replication
- [ ] Test Domain Controller failover
- [ ] Deploy AD CS / PKI
- [ ] Configure LDAPS
- [ ] Integrate an external application with LDAP
- [ ] Automate infrastructure deployment

## 📚 Documentation

Full technical documentation, deployment procedures and troubleshooting guides are available in [`/docs`](docs/).

## 🎯 Purpose

The goal of this project is to build a realistic enterprise identity environment from scratch and understand how **Active Directory, DNS, Kerberos, LDAP, PKI and authorization** work together.

Future iterations will focus on **PowerShell automation, Infrastructure as Code, monitoring and hybrid identity**.

---

> ⚠️ This project is intended for educational and homelab purposes and should not be considered a production-ready Active Directory architecture.
