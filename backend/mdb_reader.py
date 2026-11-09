"""
Lecteur minimal (lecture seule) de bases Microsoft Access au format Jet 4 (.mdb Access 2000/2003).
Sans dépendance externe : sert à importer l'historique des anciennes bases d'immobilisations.

Usage :
    db = MdbFile("ancienne.mdb")
    db.tables()                     -> ['Immobilisation', ...]
    db.columns("Immobilisation")    -> ['Code', 'Désignation', ...]
    db.rows("Immobilisation")       -> [{'Code': 'A01', ...}, ...]
"""

import struct
from datetime import datetime, timedelta

PAGE = 4096

T_BOOL, T_BYTE, T_INT, T_LONG, T_MONEY, T_FLOAT, T_DOUBLE, T_DATETIME, T_BINARY, T_TEXT, T_OLE, T_MEMO = \
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
T_GUID, T_NUMERIC = 15, 16


class MdbError(Exception):
    pass


def _decode_text(b):
    """Texte Jet 4 : UTF-16LE, éventuellement en 'compression unicode' (préfixe FF FE)."""
    if len(b) >= 2 and b[0] == 0xFF and b[1] == 0xFE:
        out, i, compressed = [], 2, True
        while i < len(b):
            if b[i] == 0:
                compressed = not compressed
                i += 1
                continue
            if compressed:
                out.append(bytes([b[i]]).decode('cp1252', 'replace'))
                i += 1
            else:
                out.append(b[i:i + 2].decode('utf-16-le', 'replace'))
                i += 2
        return ''.join(out)
    try:
        return b.decode('utf-16-le')
    except UnicodeDecodeError:
        return b.decode('utf-16-le', 'replace')


class _Table:
    def __init__(self, cols, num_cols):
        self.cols = cols            # liste de dicts {name,type,num,fixed,var_idx,offset,size,flags}
        self.num_cols = num_cols


class MdbFile:
    def __init__(self, path):
        with open(path, 'rb') as f:
            self.data = f.read()
        if self.data[4:19] != b'Standard Jet DB' or self.data[0x14] != 1:
            raise MdbError("Format non pris en charge (Jet 4 / Access 2000-2003 attendu)")
        self.npages = len(self.data) // PAGE
        self._owner = None
        self._tdefs = {}
        self._catalog = None

    # ------------------------------------------------------------ pages
    def _page(self, n):
        return self.data[n * PAGE:(n + 1) * PAGE]

    def _owner_map(self):
        if self._owner is None:
            self._owner = {}
            d = self.data
            for n in range(self.npages):
                if d[n * PAGE] == 0x01:
                    owner = struct.unpack_from('<I', d, n * PAGE + 4)[0]
                    self._owner.setdefault(owner, []).append(n)
        return self._owner

    # ------------------------------------------------------------ définition de table
    def _tdef(self, pg):
        if pg in self._tdefs:
            return self._tdefs[pg]
        buf = b''
        n = pg
        seen = set()
        while n and n not in seen:
            seen.add(n)
            p = self._page(n)
            if p[0] != 0x02:
                raise MdbError(f"Page {n} n'est pas une définition de table")
            buf += p if not buf else p[8:]
            n = struct.unpack_from('<I', p, 4)[0]
        num_var = struct.unpack_from('<H', buf, 43)[0]
        num_cols = struct.unpack_from('<H', buf, 45)[0]
        num_idx = struct.unpack_from('<I', buf, 47)[0]
        num_ridx = struct.unpack_from('<I', buf, 51)[0]
        pos = 63 + num_ridx * 12
        cols = []
        for _ in range(num_cols):
            e = buf[pos:pos + 25]
            ctype = e[0]
            cnum = struct.unpack_from('<H', e, 5)[0]
            var_idx = struct.unpack_from('<H', e, 7)[0]
            flags = e[15]
            fixed_off = struct.unpack_from('<H', e, 21)[0]
            size = struct.unpack_from('<H', e, 23)[0]
            cols.append({'type': ctype, 'num': cnum, 'var_idx': var_idx, 'fixed': bool(flags & 0x01),
                         'offset': fixed_off, 'size': size})
            pos += 25
        for c in cols:
            ln = struct.unpack_from('<H', buf, pos)[0]
            c['name'] = _decode_text(buf[pos + 2:pos + 2 + ln])
            pos += 2 + ln
        cols.sort(key=lambda c: c['num'])
        t = _Table(cols, num_cols)
        self._tdefs[pg] = t
        return t

    # ------------------------------------------------------------ lecture des lignes
    def _iter_page_rows(self, pgno):
        p = self._page(pgno)
        nrec = struct.unpack_from('<H', p, 12)[0]
        prev = PAGE
        for i in range(nrec):
            off = struct.unpack_from('<H', p, 14 + 2 * i)[0]
            start = off & 0x1FFF
            end = prev
            prev = start if start else prev
            if off & 0x8000:      # supprimée
                continue
            if off & 0x4000:      # pointeur de débordement
                ptr = struct.unpack_from('<I', p, start)[0]
                opg, orow = ptr >> 8, ptr & 0xFF
                r = self._row_bytes(opg, orow)
                if r:
                    yield r
                continue
            yield p[start:end]

    def _row_bytes(self, pgno, rownum):
        p = self._page(pgno)
        if p[0] != 0x01:
            return None
        nrec = struct.unpack_from('<H', p, 12)[0]
        if rownum >= nrec:
            return None
        off = struct.unpack_from('<H', p, 14 + 2 * rownum)[0]
        start = off & 0x1FFF
        end = PAGE if rownum == 0 else (struct.unpack_from('<H', p, 14 + 2 * (rownum - 1))[0] & 0x1FFF)
        return p[start:end]

    def _lval(self, raw):
        """Lit un champ mémo / OLE (12 octets d'en-tête)."""
        if len(raw) < 12:
            return b''
        length = struct.unpack_from('<I', raw, 0)[0]
        ptr = struct.unpack_from('<I', raw, 4)[0]
        if length & 0x80000000:
            return raw[12:12 + (length & 0x3FFFFFFF)]
        out = b''
        seen = 0
        while ptr and seen < 10000:
            seen += 1
            row = self._row_bytes(ptr >> 8, ptr & 0xFF)
            if row is None or len(row) < 4:
                break
            nxt = struct.unpack_from('<I', row, 0)[0]
            out += row[4:]
            if length & 0x40000000:
                break
            ptr = nxt
        return out[:length & 0x3FFFFFFF]

    def _parse_row(self, t, row):
        n = len(row)
        if n < 4:
            return None
        ncols = struct.unpack_from('<H', row, 0)[0]
        mask_sz = (ncols + 7) // 8
        if mask_sz + 3 > n:
            return None
        mask = row[n - mask_sz:]
        nvar = struct.unpack_from('<H', row, n - mask_sz - 2)[0]
        var_offs = []
        for k in range(nvar + 1):
            pos = n - mask_sz - 2 - 2 * (k + 1)
            if pos < 0:
                return None
            var_offs.append(struct.unpack_from('<H', row, pos)[0])
        out = {}
        for c in t.cols:
            num = c['num']
            present = (num // 8 < len(mask)) and bool(mask[num // 8] & (1 << (num % 8)))
            ct = c['type']
            if ct == T_BOOL:
                out[c['name']] = present
                continue
            if not present:
                out[c['name']] = None
                continue
            if c['fixed']:
                s = 2 + c['offset']
                size = {T_BYTE: 1, T_INT: 2, T_LONG: 4, T_MONEY: 8, T_FLOAT: 4, T_DOUBLE: 8, T_DATETIME: 8,
                        T_GUID: 16, T_NUMERIC: 17}.get(ct, c['size'])
                raw = row[s:s + size]
            else:
                vi = c['var_idx']
                if vi >= nvar:
                    out[c['name']] = None
                    continue
                raw = row[var_offs[vi]:var_offs[vi + 1]]
            out[c['name']] = self._convert(ct, raw)
        return out

    def _convert(self, ct, raw):
        try:
            if ct == T_BYTE:
                return raw[0]
            if ct == T_INT:
                return struct.unpack('<h', raw)[0]
            if ct == T_LONG:
                return struct.unpack('<i', raw)[0]
            if ct == T_MONEY:
                return struct.unpack('<q', raw)[0] / 10000.0
            if ct == T_FLOAT:
                return struct.unpack('<f', raw)[0]
            if ct == T_DOUBLE:
                return struct.unpack('<d', raw)[0]
            if ct == T_DATETIME:
                d = struct.unpack('<d', raw)[0]
                return datetime(1899, 12, 30) + timedelta(days=d)
            if ct == T_TEXT:
                return _decode_text(raw)
            if ct == T_MEMO:
                return _decode_text(self._lval(raw))
            if ct == T_NUMERIC:
                return None
            return raw
        except Exception:
            return None

    def _read_table(self, tdef_pg):
        t = self._tdef(tdef_pg)
        rows = []
        for pg in self._owner_map().get(tdef_pg, []):
            for r in self._iter_page_rows(pg):
                parsed = self._parse_row(t, r)
                if parsed is not None:
                    rows.append(parsed)
        return rows

    # ------------------------------------------------------------ API publique
    def _catalog_rows(self):
        if self._catalog is None:
            self._catalog = self._read_table(2)
        return self._catalog

    def _table_pages(self):
        res = {}
        for r in self._catalog_rows():
            if r.get('Type') == 1 and r.get('Name') and not str(r['Name']).startswith('MSys'):
                flags = r.get('Flags') or 0
                if flags & 0x80000000 or flags < 0:
                    continue
                res[r['Name']] = (r['Id'] & 0xFFFFFF)
        return res

    def tables(self):
        return sorted(self._table_pages().keys())

    def columns(self, table):
        return [c['name'] for c in self._tdef(self._table_pages()[table]).cols]

    def rows(self, table):
        return self._read_table(self._table_pages()[table])


if __name__ == '__main__':
    import sys
    db = MdbFile(sys.argv[1])
    for tname in db.tables():
        try:
            print(tname, len(db.rows(tname)), db.columns(tname))
        except Exception as e:
            print(tname, 'ERREUR', e)
