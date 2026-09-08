"""Prepare public employer-plan data. No participant or contact records are emitted.

Run with the original DOL Form 5500, Schedule H and 5500-SF ZIP downloads.
Joins schedules by ACK_ID; retains the latest filing for EIN/plan/plan year.
"""
import argparse
import csv
import datetime as dt
import hashlib
import io
import json
from pathlib import Path
import re
from zipfile import ZipFile

SOURCE = 'https://www.dol.gov/agencies/ebsa/about-ebsa/our-activities/public-disclosure/foia/form-5500-datasets'

def records(path):
    with ZipFile(path) as archive:
        for name in archive.namelist():
            if name.lower().endswith('.csv'):
                with archive.open(name) as stream:
                    yield from csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8-sig', errors='replace'))

def number(value):
    try:
        return int(str(value).replace(',', '').strip())
    except (ValueError, TypeError):
        return None

def date(value):
    for fmt in ('%Y-%m-%d', '%Y-%m-%d %H:%M:%S', '%m/%d/%Y'):
        try:
            return dt.datetime.strptime(str(value).strip(), fmt).date().isoformat()
        except ValueError:
            pass
    return ''

def normalize(row, schedule=None, short=False):
    prefix = 'SF_' if short else ''
    codes = str(row.get(prefix + 'TYPE_PENSION_BNFT_CODE', ''))
    code_set = set(re.findall(r'[1234][A-Z]', codes.upper()))
    # Only defined-contribution pension filings. Welfare and DB filings are not a 401(k) proxy.
    if not any(code.startswith('2') for code in code_set):
        return None
    def get(long, sf):
        return row.get(sf if short else long, '').strip()
    ein = re.sub(r'\D', '', get('SPONS_DFE_EIN', 'SF_SPONS_EIN'))
    raw_pn = get('SPONS_DFE_PN', 'SF_PLAN_NUM')
    pn = raw_pn.zfill(3)
    period = date(get('FORM_PLAN_YEAR_BEGIN_DATE', 'SF_PLAN_YEAR_BEGIN_DATE'))
    if not re.fullmatch(r'\d{9}', ein) or not raw_pn or not re.fullmatch(r'\d{3}', pn) or pn == '000' or not period:
        return None
    assets = number(row.get('SF_NET_ASSETS_EOY_AMT')) if short else number((schedule or {}).get('NET_ASSETS_EOY_AMT'))
    balances = number(row.get(prefix + 'PARTCP_ACCOUNT_BAL_CNT'))
    # Missing or zero account-balance denominator yields unknown, never a fabricated average.
    average = round(assets / balances, 2) if assets is not None and assets >= 0 and balances and balances > 0 else None
    sponsor = get('SPONSOR_DFE_NAME', 'SF_SPONSOR_NAME')
    if not sponsor:
        return None
    return {
        'id': f'{ein}:{pn}:{period}', 'ein': ein, 'plan_number': pn, 'plan_year': int(period[:4]),
        'period_start': period, 'ack_id': row['ACK_ID'], 'filed_at': date(row.get('DATE_RECEIVED')),
        'sponsor': sponsor, 'sponsor_key': re.sub(r'[^\w]+', ' ', sponsor.lower()).strip(),
        'plan_name': get('PLAN_NAME', 'SF_PLAN_NAME'),
        'city': get('SPONS_DFE_MAIL_US_CITY', 'SF_SPONS_US_CITY'),
        'state': get('SPONS_DFE_MAIL_US_STATE', 'SF_SPONS_US_STATE'),
        'plan_type': '401k' if '2J' in code_set else 'defined_contribution',
        'benefit_codes': sorted(code_set), 'net_assets': assets,
        'participants_with_balances': balances, 'average_account_balance': average,
        'separated_future_benefits': number(row.get('RTD_SEP_PARTCP_FUT_CNT')) if not short else None,
        'in_service_distributions_reported': {'1': True, '2': False}.get(row.get('SF_IN_SERVICE_DISTRIB_IND')) if short else None,
        'all_assets_distributed': {'1': True, '2': False}.get(row.get('SF_ALL_PLAN_AST_DISTRIB_IND') if short else (schedule or {}).get('ALL_PLAN_AST_DISTRIB_IND')),
        'source_url': SOURCE, 'scope': 'employer_plan', 'individual_balance': None,
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--form', required=True)
    parser.add_argument('--schedule-h', required=True)
    parser.add_argument('--short-form')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    schedules = {r['ACK_ID']: r for r in records(args.schedule_h)}
    latest = {}
    read = 0
    for path, short in [(args.form, False), (args.short_form, True)]:
        if not path:
            continue
        for row in records(path):
            read += 1
            plan = normalize(row, schedules.get(row.get('ACK_ID')), short)
            if not plan:
                continue
            previous = latest.get(plan['id'])
            if not previous or (plan['filed_at'], plan['ack_id']) > (previous['filed_at'], previous['ack_id']):
                latest[plan['id']] = plan
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('w', encoding='utf-8') as stream:
        for plan in sorted(latest.values(), key=lambda p: p['id']):
            stream.write(json.dumps(plan, ensure_ascii=False) + '\n')
    summary = {'input_rows': read, 'employer_plans': len(latest), 'with_account_average': sum(p['average_account_balance'] is not None for p in latest.values()), 'with_separated_future_benefits': sum((p['separated_future_benefits'] or 0) > 0 for p in latest.values()), 'with_reported_in_service_distributions': sum(p['in_service_distributions_reported'] is True for p in latest.values()), 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'source_url': SOURCE, 'generated_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'person_leads': 0}
    output.with_suffix('.summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print(json.dumps(summary))

if __name__ == '__main__':
    main()
