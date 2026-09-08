import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('catalog', Path(__file__).resolve().parents[1] / 'scripts/prepare-plan-catalog.py')
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)

class CatalogTests(unittest.TestCase):
    def test_schedule_projection_keeps_only_catalog_fields(self):
        values=catalog.schedule_values({'NET_ASSETS_EOY_AMT':'10','ALL_PLAN_AST_DISTRIB_IND':'2','UNUSED_COLUMN':'large unused value'})
        self.assertEqual(values,{'NET_ASSETS_EOY_AMT':'10','ALL_PLAN_AST_DISTRIB_IND':'2','IN_SERVICE_DISTRIB_IND':None})

    def test_schedule_i_financial_fields_use_small_prefix(self):
        values=catalog.schedule_values({'SMALL_NET_ASSETS_EOY_AMT':'5000000','SMALL_ALL_PLAN_AST_DISTRIB_IND':'2','IN_SERVICE_DISTRIB_IND':'1'},small=True)
        plan=catalog.normalize(self.row(),values)
        self.assertEqual(plan['average_account_balance'],50000)
        self.assertFalse(plan['all_assets_distributed'])
        self.assertTrue(plan['in_service_distributions_reported'])

    def row(self):
        return {'ACK_ID': 'filing-a', 'TYPE_PENSION_BNFT_CODE': '2J', 'SPONS_DFE_EIN': '123456789', 'SPONS_DFE_PN': '1', 'FORM_PLAN_YEAR_BEGIN_DATE': '2025-01-01', 'SPONSOR_DFE_NAME': 'Example Manufacturing', 'PARTCP_ACCOUNT_BAL_CNT': '100'}

    def test_schedule_join_and_denominator(self):
        p=catalog.normalize(self.row(), {'NET_ASSETS_EOY_AMT':'5000000'})
        self.assertEqual(p['average_account_balance'], 50000)
        self.assertEqual(p['scope'], 'employer_plan')
        self.assertIsNone(p['individual_balance'])
        self.assertIsNone(catalog.normalize(self.row())['average_account_balance'])
        row=self.row();row['PARTCP_ACCOUNT_BAL_CNT']='0'
        self.assertIsNone(catalog.normalize(row, {'NET_ASSETS_EOY_AMT':'5000000'})['average_account_balance'])

    def test_welfare_and_defined_benefit_excluded(self):
        row=self.row();row['TYPE_PENSION_BNFT_CODE']='1A'
        self.assertIsNone(catalog.normalize(row))
        row['TYPE_PENSION_BNFT_CODE']=''
        self.assertIsNone(catalog.normalize(row))

    def test_missing_plan_identity_and_distribution_status_are_not_invented(self):
        row=self.row()
        self.assertIsNone(catalog.normalize(row)['all_assets_distributed'])
        self.assertFalse(catalog.normalize(row, {'ALL_PLAN_AST_DISTRIB_IND':'2'})['all_assets_distributed'])
        self.assertTrue(catalog.normalize(row, {'ALL_PLAN_AST_DISTRIB_IND':'1'})['all_assets_distributed'])
        self.assertTrue(catalog.normalize(row, {'IN_SERVICE_DISTRIB_IND':'1'})['in_service_distributions_reported'])
        self.assertFalse(catalog.normalize(row, {'IN_SERVICE_DISTRIB_IND':'2'})['in_service_distributions_reported'])
        for value in ['', '000']:
            row['SPONS_DFE_PN']=value
            self.assertIsNone(catalog.normalize(row))

    def test_blank_short_form_fields_stay_unknown(self):
        row={'ACK_ID':'short','SF_TYPE_PENSION_BNFT_CODE':'2J','SF_SPONS_EIN':'123456789','SF_PLAN_NUM':'1','SF_PLAN_YEAR_BEGIN_DATE':'2025-01-01','SF_SPONSOR_NAME':'Example','SF_IN_SERVICE_DISTRIB_IND':''}
        self.assertIsNone(catalog.normalize(row,short=True)['in_service_distributions_reported'])
        row['SF_IN_SERVICE_DISTRIB_IND']='1'
        self.assertTrue(catalog.normalize(row,short=True)['in_service_distributions_reported'])

if __name__=='__main__':
    unittest.main()
