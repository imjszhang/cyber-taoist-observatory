// Reconstructed fixture: source and evidence shapes are copied from the user's
// incident report. Card values below are test scaffolding, NOT original traces.
export const SOURCE='Leaving aside everything else, this confuses inputs with outputs. You want to get tasks done efficiently, not focus on inputs alone (its a similar risk for companies focusing solely on minimizing token cost)\n\nAnd "keep prompts short" is bad advice for getting good AI outputs.';
const card=(state,evidence)=>({state,value:'测试用定位值；不是恢复出的原始分析。',evidence,unknown:'仍需独立验证。'});
export const mapping=()=>({
  S:card('OBSERVED','"You want to get tasks done efficiently"；"companies focusing solely on minimizing token cost"'),
  N:card('HYPOTHESIS','You want to get tasks done efficiently；getting good AI outputs'),
  R:card('OBSERVED','"keep prompts short" is bad advice；"companies focusing solely on minimizing token cost"'),
  T:card('INFERRED','You want to get tasks done efficiently；good AI outputs'),
  EC:card('UNKNOWN','无直接对应的生态描述'),
  NI:card('UNKNOWN','无直接对应的生态位描述')
});
export const insight=()=>({headline:'测试：应看最终任务结果，而不只看投入。',text:'如果只优化提示词长度或 token 投入，可能忽略任务结果。此为待验证解释。',evidence:['You want to get tasks done efficiently','"keep prompts short" is bad advice'],alternative:'原文是观点表达，缺少对照数据。',verificationSignal:'比较同类任务的完成效果。',refutationSignal:'如果缩短提示仍稳定改善相同任务结果，该解释需要修正。'});
