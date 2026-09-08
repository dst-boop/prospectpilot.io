"""Download the three original public DOL datasets to a temporary job directory."""
import datetime
from pathlib import Path
import sys
from urllib.request import Request, urlopen
from urllib.parse import urlparse

year=int(sys.argv[1])
if not 2023 <= year <= datetime.datetime.now().year:
    raise ValueError('Invalid form year')
root=Path(sys.argv[2])
for pattern in ('F_5500_{year}_Latest.zip','F_SCH_H_{year}_Latest.zip','F_5500_SF_{year}_Latest.zip'):
    name=pattern.format(year=year)
    url=f'https://www.askebsa.dol.gov/FOIA%20Files/{year}/Latest/{name}'
    request=Request(url,headers={'User-Agent':'ProspectPilotResearch/1.0 (+https://prospectpilot.io)'})
    with urlopen(request,timeout=90) as response, (root/name).open('wb') as stream:
        if urlparse(response.url).hostname not in {'askebsa.dol.gov','www.askebsa.dol.gov'}:
            raise ValueError('DOL download redirected outside its official host')
        size=0
        while chunk:=response.read(1024*1024):
            size+=len(chunk)
            if size>300*1024*1024:
                raise ValueError('DOL archive exceeds the configured download limit')
            stream.write(chunk)
    print(f'Downloaded public {name}: {size} bytes')
