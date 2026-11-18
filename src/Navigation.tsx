import { ListFilter, RotateCcw } from 'lucide-react'
import { ScrollArea } from '@/components/liquikit/scroll-area'
import { Select } from '@/components/liquikit/select'
import { Menu } from '@/components/liquikit/menu'
import type { Stage } from './data'

export const ALL='__all__'
export type Scope=Stage|typeof ALL
export const fmt=(n:number)=>n.toLocaleString('en-US')
export const SCOPES=[
  {value:ALL,label:'All blocks',short:'All'},
  {value:'World generation',label:'World gen',short:'World gen'},
  {value:'After generation',label:'Later examples',short:'Later'},
  {value:'Other registered',label:'Other IDs',short:'Other'},
] satisfies ReadonlyArray<{value:Scope;label:string;short:string}>
export const SORTS=[
  {value:'alphabet',label:'Name A–Z'}, {value:'reverse',label:'Name Z–A'},
  {value:'near',label:'Closest color first'}, {value:'far',label:'Farthest color first'},
]
const shortCategory: Record<string,string>={
 'Decor & furnishings':'Furnishings','Dyed building blocks':'Dyed blocks','Engineering & technical':'Technical blocks','Plants & agriculture':'Plants & crops',
}
export function CategoryPicker({options,value,onChange}:{options:string[];value:string;onChange:(value:string)=>void}){
 const items=[{value:ALL,label:'All categories'},...options.map(v=>({value:v,label:shortCategory[v]||v}))]
 return <Select.Root<string> items={items} value={value} onValueChange={v=>{if(v!==null)onChange(v)}}>
  <Select.Trigger size="regular" aria-label="Block category"/>
  <Select.Popup align="end" sideOffset={8}>
    <ScrollArea viewportProps={{tabIndex:undefined, role:'presentation'}} style={{height:`min(${38*items.length}px, 55dvh, max(5rem, calc(var(--available-height, 55dvh) - 12px)))`}}>
      {items.map(i=><Select.Item key={i.value} value={i.value}>{i.label}</Select.Item>)}
    </ScrollArea>
  </Select.Popup>
 </Select.Root>
}
export function ViewMenu({sort,verdict,choices,onSort,onVerdict,onReset,canReset}:{sort:string;verdict:string;choices:string[];onSort:(value:string)=>void;onVerdict:(value:string)=>void;onReset:()=>void;canReset:boolean}){
 return <Menu.Root>
  <Menu.Trigger size="regular" aria-label="View options" title="Filter and sort blocks"><ListFilter aria-hidden="true"/>View</Menu.Trigger>
  <Menu.Popup align="end" sideOffset={8}>
    <ScrollArea viewportProps={{tabIndex:undefined, role:'presentation'}} style={{height:`min(${(choices.length+2+SORTS.length)*38+61}px, 61dvh, max(5rem, calc(var(--available-height, 61dvh) - 12px)))`}}>
      <Menu.Group><Menu.GroupLabel>Match type</Menu.GroupLabel>
        <Menu.RadioGroup value={verdict} onValueChange={onVerdict}>
          <Menu.RadioItem value={ALL}>All matches</Menu.RadioItem>
          {choices.map(v=><Menu.RadioItem key={v} value={v}>{v}</Menu.RadioItem>)}
        </Menu.RadioGroup>
      </Menu.Group>
      <Menu.Separator/>
      <Menu.Group><Menu.GroupLabel>Sort by</Menu.GroupLabel>
        <Menu.RadioGroup value={sort} onValueChange={onSort}>
          {SORTS.map(s=><Menu.RadioItem key={s.value} value={s.value}>{s.label}</Menu.RadioItem>)}
        </Menu.RadioGroup>
      </Menu.Group>
      <Menu.Separator/>
      <Menu.Item disabled={!canReset} icon={<RotateCcw/>} onClick={onReset}>Reset view</Menu.Item>
    </ScrollArea>
  </Menu.Popup>
 </Menu.Root>
}
