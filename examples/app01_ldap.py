"""Demo de consola de laboratorio. No implementa un servicio de producción."""
import ssl
import getpass
from ldap3 import Server, Connection, Tls, SUBTREE, NONE
from ldap3.utils.conv import escape_filter_chars
from ldap3.core.exceptions import LDAPSocketOpenError, LDAPSocketReceiveError

HOSTS = ('dc01.ad.lab.test', 'dc02.ad.lab.test')
BASE = 'OU=Usuarios,DC=ad,DC=lab,DC=test'
GROUP = 'CN=GG_APP_Usuarios,OU=Grupos,DC=ad,DC=lab,DC=test'
CA = '/etc/ssl/certs/ca-certificates.crt'

def login(host, service_password, username, password):
    # Tls validates the chain and ldap3 checks the server hostname.
    server = Server(host, port=636, use_ssl=True, get_info=NONE,
                    connect_timeout=5,
                    tls=Tls(validate=ssl.CERT_REQUIRED, ca_certs_file=CA))
    search = Connection(server, user='svc_ldap_app@ad.lab.test',
                        password=service_password, receive_timeout=10)
    user = None
    try:
        if not search.bind():
            return False  # Includes invalid service credentials: do not retry.
        filt = '(sAMAccountName=' + escape_filter_chars(username) + ')'
        if not search.search(BASE, filt, SUBTREE, attributes=['distinguishedName'],
                             size_limit=2):
            return False
        if len(search.entries) != 1:
            return False
        dn = search.entries[0].entry_dn
        user = Connection(server, user=dn, password=password, receive_timeout=10)
        if not user.bind():
            return False  # Bad passwords must not cause cross-DC retries.
        authorized = ('(&(sAMAccountName=' + escape_filter_chars(username) + ')'
                      '(memberOf:1.2.840.113556.1.4.1941:='
                      + escape_filter_chars(GROUP) + '))')
        return bool(search.search(BASE, authorized, SUBTREE,
                                  attributes=['distinguishedName'], size_limit=2)
                    and len(search.entries) == 1)
    finally:
        if user is not None:
            user.unbind()
        search.unbind()

def main():
    service_password = getpass.getpass('Clave de cuenta de búsqueda: ')
    username = input('sAMAccountName (ej. jperez): ').strip()
    password = getpass.getpass('Clave del usuario: ')
    if not service_password or not username or not password:
        print('Acceso rechazado.'); return 1
    for host in HOSTS:
        try:
            ok = login(host, service_password, username, password)
            print('Acceso autorizado.' if ok else 'Acceso rechazado.')
            return 0 if ok else 1
        except (LDAPSocketOpenError, LDAPSocketReceiveError, OSError):
            continue  # Transport failure only. Each endpoint still requires TLS.
    print('Servicio de identidad no disponible.'); return 2

if __name__ == '__main__':
    raise SystemExit(main())
