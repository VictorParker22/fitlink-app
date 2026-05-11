import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qcmtaskhyhwzyoegtfpw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IxZ1QUlo0for6NcOQvf-xw_D0-vmrXL';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testInsert() {
  const { data, error } = await supabase.from('plans').insert({
    trainer_id: '00000000-0000-0000-0000-000000000000',
    name: 'Test Plan',
    price: 10,
    period: 'month',
    features: ['feature 1'],
    color: '#000000',
    is_popular: false
  });
  
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Success:', data);
  }
}

testInsert();
